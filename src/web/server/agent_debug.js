const path = require('node:path')
const fs = require('node:fs/promises')
const { redact } = require('../../utils/redact')

const stores = new WeakMap()
const MAX_TEXT = 128 * 1024
function getDebugStore(manager) {
  if (stores.has(manager)) return stores.get(manager)
  const store = new AgentDebugStore(manager)
  stores.set(manager, store)
  return store
}

class AgentDebugStore {
  constructor(manager) {
    this.manager = manager
    this.agents = new Map()
    this.listeners = []
    this.revision = 0
    for (const kind of ['input', 'output', 'error']) this.listen(`agent:llm:${kind}`, data => this.record(kind, data))
    this.listen('agent:step:done', data => this.record('execution', data))
    this.listen('agent:task:update', () => { this.revision++ })
    for (const event of ['agent:connect', 'agent:disconnect']) this.listen(event, ({ name }) => { this.agents.delete(name); this.revision++ })
  }

  listen(event, handler) {
    this.manager.eventBus?.on(event, handler)
    this.listeners.push([event, handler])
  }

  secrets() {
    return [this.manager.config?.llm?.apiKey,
      ...[...(this.manager.agentConfigs?.values() || [])].map(config => config.llm?.apiKey),
      ...[...this.manager.agents.values()].flatMap(agent => [agent.config?.llm?.apiKey, agent.brainLoop?.llm?.apiKey])]
  }

  clean(text) { return redact(text, this.secrets()) }

  context(name) {
    const agent = this.manager.agents.get(name)
    if (!agent) return null
    let context = this.agents.get(name)
    if (!context || context.sessionId !== agent.sessionId) {
      context = { sessionId: agent.sessionId, turns: [], observation: null }
      this.agents.set(name, context)
    }
    return context
  }

  record(kind, data) {
    const agent = this.manager.agents.get(data.name)
    if (!agent || data.sessionId !== agent.sessionId || typeof data.requestId !== 'string' || data.requestId.length > 80) return
    const context = this.context(data.name)
    let turn = context.turns.find(turn => turn.requestId === data.requestId)
    if (kind === 'input') {
      if (turn) return
      let budget = MAX_TEXT
      let truncated = false
      const messages = (data.messages || []).slice(0, 32).map(message => {
        const clean = this.clean(message.content)
        const content = clean.slice(0, budget)
        budget -= content.length
        if (clean.length > content.length) truncated = true
        return { role: String(message.role), content }
      })
      if ((data.messages?.length || 0) > messages.length) truncated = true
      turn = { requestId: data.requestId, model: this.clean(data.model), taskId: data.taskId ?? null, step: data.step ?? null, startedAt: data.timestamp || Date.now(),
        status: 'pending', messages, inputTruncated: truncated }
      context.turns.push(turn)
      if (context.turns.length > 10) context.turns.shift()
    } else if (kind === 'execution') {
      if (!turn) return
      turn.timings = data.timings
      turn.usage = data.usage
      turn.execution = data.result ? this.clean(JSON.stringify(data.result)).slice(0, MAX_TEXT) : null
      turn.executionTruncated = !!data.result && this.clean(JSON.stringify(data.result)).length > MAX_TEXT
      turn.executionError = data.error ? this.clean(data.error).slice(0, 8192) : null
      turn.executionStatus = data.cancelled ? 'cancelled' : data.superseded ? 'superseded' : data.result ? (data.result.ok === false ? 'failed' : 'returned') : 'not_executed'
    } else {
      if (!turn || turn.status !== 'pending') return
      turn.finishedAt = data.timestamp || Date.now()
      turn.durationMs = Math.max(0, turn.finishedAt - turn.startedAt)
      if (kind === 'output') {
        const response = this.clean(data.response)
        turn.response = response.slice(0, MAX_TEXT)
        turn.outputTruncated = response.length > MAX_TEXT
        turn.command = data.command ? this.clean(data.command) : null
        turn.status = 'responded'
      } else {
        turn.status = data.cancelled ? 'cancelled' : 'failed'
        turn.error = this.clean(data.error).slice(0, 8192)
      }
    }
    this.revision++
  }

  snapshot(name, section = 'all') {
    const agent = this.manager.agents.get(name)
    const context = this.context(name)
    const current = agent?.isOnline() ? context : null
    const frame = current?.observation
    return { ok: true, agentName: name, sessionId: agent?.sessionId ?? null,
      online: !!agent?.isOnline(), revision: this.revision,
      task: agent?.brainLoop?.getTaskStatus ? JSON.parse(this.clean(JSON.stringify(agent.brainLoop.getTaskStatus()))) : null,
      renderer: { enabled: !!this.manager.renderService, connected: !!this.manager.renderService?.renderer?.isConnected?.() },
      ...(section !== 'vision' ? { turns: current?.turns || [] } : {}),
      ...(section !== 'llm' ? { observation: frame?.public ?? null } : {}) }
  }

  async rememberObservation(name, result, expectedAgent) {
    const agent = this.manager.agents.get(name)
    if (!result.ok) return result
    const observation = result.observation, frame = observation?.frame
    const config = this.manager.renderService?.config
    if (!agent || agent !== expectedAgent || !agent.isOnline() || observation?.sessionId !== agent.sessionId
        || observation.agentName !== name || !config || frame?.agentId !== this.manager.renderService.ids?.get(name)
        || frame.memoryNamespace !== config.memoryNamespace || !/^[a-f0-9-]{36}$/i.test(frame.frameId)
        || frame.rgb?.file !== `${frame.frameId}.png`) throw new Error('Observation identity is not current')
    const directory = path.resolve(config.outputDir || 'runs/observations', config.memoryNamespace, frame.agentId)
    const publicView = { frameId: frame.frameId, sessionId: agent.sessionId, revision: observation.revision,
      observedAt: observation.observedAt, width: frame.width, height: frame.height,
        dimension: frame.dimension, camera: frame.camera, perspective: frame.perspective || 'first-person', previewOnly: !!frame.previewOnly,
      rgbUrl: `/api/agents/${encodeURIComponent(name)}/observation/${frame.frameId}/rgb` }
    this.context(name).observation = { directory, file: frame.rgb.file, public: publicView }
    this.revision++
    return { ok: true, observation: publicView }
  }

  close() {
    for (const [event, handler] of this.listeners) this.manager.eventBus?.removeListener(event, handler)
    this.listeners = []
    this.agents.clear()
    stores.delete(this.manager)
  }
}

function registerDebugRoutes(app, manager) {
  const store = getDebugStore(manager)
  app.get('/api/agents/:name/debug', (req, res) => {
    if (!manager.agents.has(req.params.name) && !manager.agentConfigs?.has(req.params.name)) return res.status(404).json({ ok: false, error: 'Agent not found' })
    const section = req.query.section || 'all'
    if (!['all', 'vision', 'llm'].includes(section)) return res.status(400).json({ ok: false, error: 'Unknown debug section' })
    const data = store.snapshot(req.params.name, section)
    const tag = `"${section}-${data.sessionId || 'offline'}-${data.online}-${data.revision}"`
    res.set('Cache-Control', 'private, no-cache').set('ETag', tag)
    if (req.get('If-None-Match') === tag) return res.status(304).end()
    res.json(data)
  })
  app.get('/api/agents/:name/observation/:frameId/rgb', async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const agent = manager.agents.get(req.params.name)
    const record = agent?.isOnline() && store.context(req.params.name)?.observation
    if (!record || record.public.frameId !== req.params.frameId) return res.sendStatus(404)
    try {
      const directory = await fs.realpath(record.directory)
      const file = await fs.realpath(path.join(directory, record.file))
      if (!file.startsWith(directory + path.sep)) return res.sendStatus(404)
      // Check again after I/O so a disconnected/replaced session cannot serve its old frame.
      if (manager.agents.get(req.params.name) !== agent || !agent.isOnline() || store.context(req.params.name)?.observation !== record) return res.sendStatus(404)
      res.type('png').sendFile(file)
    } catch { res.sendStatus(404) }
  })
}

module.exports = { AgentDebugStore, getDebugStore, registerDebugRoutes, redact }
