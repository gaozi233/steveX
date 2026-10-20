const { EventEmitter } = require('events')
const { SteveXAgent } = require('./agent')
const { loadCommands } = require('../commands')

class AgentManager {
  constructor(loadConfig) {
    this.loadConfig = loadConfig
    this.config = this.loadConfig()
    this.sharedCommands = loadCommands().commands
    this.agents = new Map()
    this.eventBus = new EventEmitter()
    this.eventBus.setMaxListeners(50)

    // Pre-index agent configs by name for O(1) lookup
    this.agentConfigs = new Map(
      (this.config.agents || []).map(cfg => [cfg.name, cfg])
    )
  }

  // ── Lifecycle ──

  disconnectAll() {
    for (const name of this.agents.keys()) {
      this.disconnectAgent(name)
    }
  }

  reload() {
    this.disconnectAll()
    this.config = this.loadConfig()
    this.agentConfigs = new Map(
      (this.config.agents || []).map(cfg => [cfg.name, cfg])
    )
  }

  connectAgent(name) {
    const cfg = this.agentConfigs.get(name)
    const existing = this.agents.get(name)
    if (!cfg || existing?.isOnline() || existing?.isConnecting()) return !!cfg

    const agent = new SteveXAgent(cfg, name, this.sharedCommands)
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

  // ── Runtime data helpers ──

  getAgentBot(agent) {
    return agent?.bot || agent?.minecraftBot || agent?._bot || null
  }

  getAgentHealth(agent) {
    const bot = this.getAgentBot(agent)

    return {
      health: bot?.health ?? 20,
      maxHealth: bot?.maxHealth ?? 20
    }
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

        // Config-derived display data
        model: this.getAgentModel(cfg)
      }
    })
  }
}

module.exports = { AgentManager }
