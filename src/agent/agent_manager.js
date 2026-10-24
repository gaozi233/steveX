const { EventEmitter } = require('events')
const { SteveXAgent } = require('./agent')
const { loadCommands } = require('../commands')
const { healthState } = require('./health_state')

class AgentManager {
  constructor(loadConfig) {
    this.loadConfig = loadConfig
    this.config = this.loadConfig()
    const loaded = loadCommands()
    this.sharedCommands = loaded.commands
    this.queryNames = loaded.queryNames
    this.commandList = loaded.list
    this.agents = new Map()
    this.eventBus = new EventEmitter()
    this.eventBus.setMaxListeners(50)
    this.lifecycle = Promise.resolve()
    this.closing = false
    this.reloading = false

    // Pre-index agent configs by name for O(1) lookup
    this.agentConfigs = new Map(
      (this.config.agents || []).map(cfg => [cfg.name, cfg])
    )
    this.renderService = this.createRenderer()
  }

  createRenderer() {
    if (!this.config.renderer?.enabled) return null
    const { SharedRenderService } = require('../render_bridge/service')
    const service = new SharedRenderService(this.config.renderer, [...this.agentConfigs.values()])
    service.connect()
    return service
  }

  // ── Lifecycle ──

  async disconnectAll() {
    const stopping = [...this.agents.values()]
    for (const name of this.agents.keys()) {
      this.disconnectAgent(name)
    }
    await Promise.all(stopping.map(async agent => {
      await agent.executor.tail
      await agent.interactionMemory?.tail
    }))
  }

  reload() {
    const work = this.lifecycle.then(async () => {
      if (this.closing) throw new Error('Manager is closing')
      this.reloading = true
      try { await this.reloadNow() }
      finally { this.reloading = false }
    })
    this.lifecycle = work.catch(() => {})
    return work
  }

  async reloadNow() {
    const next = this.loadConfig()
    // Validate the next renderer config before tearing down the current runtime.
    if (next.renderer?.enabled) {
      const { SharedRenderService } = require('../render_bridge/service')
      new SharedRenderService(next.renderer, next.agents || [])
    }
    await this.disconnectAll()
    await this.renderService?.close()
    this.config = next
    this.agentConfigs = new Map(
      (this.config.agents || []).map(cfg => [cfg.name, cfg])
    )
    this.renderService = this.closing ? null : this.createRenderer()
  }

  connectAgent(name) {
    if (this.closing || this.reloading) return false
    const cfg = this.agentConfigs.get(name)
    const existing = this.agents.get(name)
    if (!cfg || existing?.isOnline() || existing?.isConnecting()) return !!cfg

    if (existing) existing.shutdown()
    const agent = new SteveXAgent(cfg, name, this.sharedCommands, { queryNames: this.queryNames, renderService: this.renderService,
      memoryNamespace: this.config.renderer?.memoryNamespace })
    agent.start()
    if (cfg?.brain?.enabled) agent.startBrain(cfg.brain, this.eventBus)
    this.agents.set(name, agent)

    this.eventBus.emit('agent:connect', { name })
    this.eventBus.emit('agent:update', {
      name,
      timestamp: Date.now()
    })

    return true
  }

  disconnectAgent(name) {
    const agent = this.agents.get(name)
    if (!agent) return false

    agent.shutdown()
    this.agents.delete(name)

    this.eventBus.emit('agent:disconnect', { name })
    this.eventBus.emit('agent:update', {
      name,
      timestamp: Date.now()
    })

    return true
  }

  // ── Operations ──

  async sendCommand(name, command) {
    const agent = this.agents.get(name)
    if (!agent) {
      return { ok: false, error: 'Agent not found or not started' }
    }

    this.eventBus.emit('agent:command:start', {
      name,
      command,
      timestamp: Date.now()
    })

    const result = await agent.executeCommand(command)

    this.eventBus.emit('agent:command:done', {
      name,
      command,
      ok: result.ok,
      output: result.output || null,
      error: result.error || null,
      timestamp: Date.now()
    })

    this.eventBus.emit('agent:update', {
      name,
      timestamp: Date.now()
    })

    return result
  }

  async captureObservation(name, options = {}) {
    const agent = this.agents.get(name)
    return agent ? agent.captureObservation({ ...options, source: 'observation' }) : { ok: false, error: 'Agent not found or not started' }
  }

  close() {
    if (this.closeWork) return this.closeWork
    this.closing = true
    this.closeWork = this.lifecycle.then(async () => {
      await this.disconnectAll()
      await this.renderService?.close()
    })
    return this.closeWork
  }

  // ── Runtime data helpers ──

  getAgentBot(agent) {
    return agent?.bot || agent?.minecraftBot || agent?._bot || null
  }

  getAgentHealth(agent) {
    const bot = this.getAgentBot(agent)

    return healthState(bot)
  }

  getAgentGameMode(agent) {
    const bot = this.getAgentBot(agent)

    return bot?.game?.gameMode ?? 'Survival'
  }

  getAgentPosition(agent) {
    const bot = this.getAgentBot(agent)
    const pos = bot?.entity?.position

    if (!pos) {
      return { x: '~', y: '~', z: '~' }
    }

    return {
      x: Number.isFinite(pos.x) ? pos.x.toFixed(1) : '~',
      y: Number.isFinite(pos.y) ? pos.y.toFixed(1) : '~',
      z: Number.isFinite(pos.z) ? pos.z.toFixed(1) : '~'
    }
  }

  getAgentAction(agent) {
    return agent?.currentAction ?? 'Idle'
  }

  getAgentModel(cfg) {
    return cfg?.llm?.model ?? 'Unknown'
  }

  // ── Queries ──

  getStatus() {
    return [...this.agentConfigs.values()].map(cfg => {
      const agent = this.agents.get(cfg.name)
      const online = agent?.isOnline() ?? false
      const { health, maxHealth } = this.getAgentHealth(agent)

      return {
        name: cfg.name,
        username: agent?.getUsername() ?? cfg.minecraft?.username ?? cfg.name,
        online,

        // Runtime status for frontend live display
        health,
        maxHealth,
        gameMode: this.getAgentGameMode(agent),
        position: this.getAgentPosition(agent),
        currentAction: this.getAgentAction(agent),
        execution: agent?.executor.getStatus() || null,
        brain: agent?.brainLoop ? { running: agent.brainLoop.running, lastError: agent.brainLoop.lastError,
          task: agent.brainLoop.getTaskStatus?.() ?? null } : null,

        // Config-derived display data
        model: this.getAgentModel(cfg)
      }
    })
  }
}

module.exports = { AgentManager }
