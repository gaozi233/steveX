const fs = require('fs/promises')
const path = require('path')
const { groupCommands } = require('../../commands/catalog')
const skillRegistry = require('../../runtime/skill_registry.ts')

const { getEnvironmentConfigPath } = require('../../utils/config')
const { validateEnvironmentConfig, writeEnvironmentConfig, publicConfig, restoreCredentials } = require('../../utils/config_write')
const ENV_CONFIG_PATH = getEnvironmentConfigPath()
const ENV_CONFIG_RELATIVE_PATH = path.relative(process.cwd(), ENV_CONFIG_PATH)

/**
 * Register all API routes on the Express app.
 */
function registerRoutes(app, manager) {
  require('./inventory').registerInventoryRoutes(app, manager)
  require('./agent_debug').registerDebugRoutes(app, manager)
  require('./world_map').registerWorldMapRoutes(app, manager)

  // ---- Status ----
  app.get('/api/status', (req, res) => {
    if (req.query.agent !== undefined && typeof req.query.agent !== 'string') return res.status(400).json({ ok: false, error: 'agent must be a single name' })
    let agents = manager.getStatus({summary:req.query.view==='summary',name:req.query.agent})
    if (typeof req.query.agent === 'string') agents = agents.filter(agent => agent.name === req.query.agent)
    if (req.query.view === 'summary') agents = agents.map(require('./agent_summary').agentSummary)
    res.json({
      agents,
      uptimeSec: Math.floor(process.uptime())
    })
  })

  app.get('/api/commands', (req, res) => {
    const commands = manager.commandList || []
    res.json({ ok: true, commands, categories: groupCommands(commands) })
  })

  // ---- Read environment config ----
  app.get('/api/config/environment', async (req, res) => {
    res.set('Cache-Control','no-store')
    try {
      const raw = await fs.readFile(ENV_CONFIG_PATH, 'utf8')
      const config = JSON.parse(raw)

      res.json({
        ok: true,
        path: ENV_CONFIG_RELATIVE_PATH,
        config:publicConfig(config)
      })
    } catch (err) {
      console.error('[web] Failed to read environment config:', err)

      res.status(500).json({
        ok: false,
        error: err.message || 'Failed to read environment config'
      })
    }
  })

  // ---- Save environment config ----
  app.post('/api/config/environment', async (req, res) => {
    res.set('Cache-Control','no-store')
    try {
      const config = req.body && req.body.config

      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return res.status(400).json({
          ok: false,
          error: 'Request body must contain a config object'
        })
      }

      const invalid=validateEnvironmentConfig(config)
      if(invalid)return res.status(400).json({ok:false,error:invalid})

      const previous=await fs.readFile(ENV_CONFIG_PATH,'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return {};throw error})
      let restored
      try{restored=restoreCredentials(config,previous)}catch{return res.status(400).json({ok:false,error:'Cannot retain a credential that does not exist'})}
      const nextRaw = `${JSON.stringify(restored, null, 2)}\n`

      // Guard against oversized config blobs
      const MAX_SIZE = 512 * 1024 // 512 KB
      if (Buffer.byteLength(nextRaw, 'utf8') > MAX_SIZE) {
        return res.status(413).json({
          ok: false,
          error: `Config too large (max ${MAX_SIZE / 1024} KB)`
        })
      }

      await writeEnvironmentConfig(ENV_CONFIG_PATH, nextRaw)

      res.json({
        ok: true,
        path: ENV_CONFIG_RELATIVE_PATH
      })
    } catch (err) {
      console.error('[web] Failed to save environment config:', err)

      res.status(500).json({
        ok: false,
        error: err.message || 'Failed to save environment config'
      })
    }
  })

  // ---- Reload config ----
  app.post('/api/reload', async (req, res) => {
    await manager.reload()
    res.json({ ok: true })
  })

  app.get('/api/renderer/status', async (req, res) => {
    res.json(manager.renderService ? await manager.renderService.status() : { enabled: false })
  })

  app.post('/api/agents/:name/observe', async (req, res) => {
    const agent = manager.agents.get(req.params.name)
    try {
      const perspective = req.body?.perspective ?? 'first-person'
      if (!['first-person', 'third-person-back', 'third-person-front'].includes(perspective)) return res.status(400).json({ ok: false, error: 'Invalid perspective' })
      const result = await manager.captureObservation(req.params.name, { perspective })
      const preview = await require('./agent_debug').getDebugStore(manager).rememberObservation(req.params.name, result, agent)
      res.status(result.ok ? 200 : 400).json({ ...result, preview: preview.observation })
    } catch (error) { res.status(400).json({ ok: false, error: require('./agent_debug').getDebugStore(manager).clean(error.message) }) }
  })

  app.post('/api/agents/:name/nbt/query', async (req, res) => {
    if (!manager.agentConfigs.has(req.params.name)) return res.status(404).json({ ok: false, error: 'Agent not found' })
    if (!manager.renderService) return res.status(400).json({ ok: false, error: 'Renderer is disabled' })
    try {
      const data = await manager.renderService.queryNbt(req.params.name, req.body)
      res.json({ ok: true, ...data })
    } catch (err) {
      res.status(400).json({ ok: false, code: err.code || 'QUERY_FAILED', error: err.message })
    }
  })

  app.get('/api/agents/:name/state', (req, res) => {
    const agent = manager.agents.get(req.params.name)
    if (!agent) return res.status(404).json({ ok: false, error: 'Agent not started' })
    try { res.json({ ok: true, ...require('../../agent/interaction_memory').playerState(agent) }) }
    catch (error) { res.status(400).json({ ok: false, error: error.message }) }
  })

  app.get('/api/agents/:name/memory/containers', (req, res) => {
    const agent = manager.agents.get(req.params.name)
    if (!agent) return res.status(404).json({ ok: false, error: 'Agent not started' })
    res.json({ ok: true, ...agent.interactionMemory.snapshot() })
  })

  app.post('/api/agents/:name/planner/message', async (req, res) => {
    const agent = manager.agents.get(req.params.name)
    if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found' })
    const { message, mode = 'once', operation = 'new', limits, taskId } = req.body || {}
    if (typeof message !== 'string' || !message.trim() || message.length > 4000 || !['once', 'continuous'].includes(mode)) {
      return res.status(400).json({ ok: false, errorCode: 'INVALID_TASK', error: 'Expected task up to 4000 characters and mode once or continuous' })
    }
    try {
      if (!agent.brainLoop) {
        const { Brain } = require('../../agent/brain')
        agent.brainLoop = new Brain(agent, agent.config.llm || {}, manager.eventBus, agent.config.brain || {})
      }
      const result = await agent.brainLoop.submitTask(message, mode, { operation, limits, taskId })
      res.status(['BRAIN_BUSY', 'TASK_CHANGED'].includes(result.errorCode) ? 409 : result.ok ? 200 : 400).json(result)
    } catch (error) {
      res.status(400).json({ ok: false, error: require('./agent_debug').getDebugStore(manager).clean(error.message) })
    }
  })

  app.post('/api/agents/:name/planner/control', async (req, res) => {
    const agent = manager.agents.get(req.params.name)
    if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found' })
    if (!agent.brainLoop) return res.status(400).json({ ok: false, errorCode: 'NO_TASK', error: 'No planner task' })
    try {
      const { operation, mode = 'once', taskId } = req.body || {}
      const result = await agent.brainLoop.controlTask(operation, { mode, taskId })
      res.status(['BRAIN_BUSY', 'TASK_CHANGED'].includes(result.errorCode) ? 409 : result.ok ? 200 : 400).json(result)
    } catch (error) { res.status(400).json({ ok: false, error: require('./agent_debug').getDebugStore(manager).clean(error.message) }) }
  })

  app.post('/api/agents/:name/brain/:operation', (req, res) => {
    const agent = manager.agents.get(req.params.name)
    if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found' })
    if (req.params.operation === 'stop') { agent.brainLoop?.stop(); return res.json({ ok: true }) }
    if (req.params.operation !== 'start') return res.status(400).json({ ok: false, error: 'Expected start or stop' })
    if (!agent.isOnline()) return res.status(400).json({ ok: false, error: 'Agent is offline' })
    const ok = agent.startBrain(agent.config.brain || {}, manager.eventBus)
    res.status(ok ? 200 : 400).json({ ok, error: ok ? undefined : agent.brainLoop?.lastError })
  })

  // ---- Connect agent ----
  app.post('/api/agents/:name/connect', (req, res) => {
    const name = req.params.name
    const ok = manager.connectAgent(name)
    res.status(ok ? 200 : 404).json({ ok })
  })

  // ---- Disconnect agent ----
  app.post('/api/agents/:name/disconnect', (req, res) => {
    const name = req.params.name
    const ok = manager.disconnectAgent(name)
    res.status(ok ? 200 : 404).json({ ok })
  })

  // ---- Execute command ----
  app.post('/api/agents/:name/command', async (req, res) => {
    const name = req.params.name
    const command = typeof req.body?.command === 'string' ? req.body.command.trim() : ''

    if (!command) {
      return res.status(400).json({
        ok: false,
        errorCode: 'INVALID_ARGUMENTS',
        error: '[INVALID_ARGUMENTS] command must be a non-empty string',
        output: '[INVALID_ARGUMENTS] command must be a non-empty string'
      })
    }

    const result = await manager.sendCommand(name, command)
    res.status(result.ok ? 200 : 400).json(result)
  })

  app.get('/api/skills', (req, res) => {
    const skills = skillRegistry.list()
    res.json({ ok: true, skills })
  });

  // ---- 404 catch-all ----
  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: 'Not found'
    })
  })
}

module.exports = { registerRoutes }
