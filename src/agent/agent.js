const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const mcDataLoader = require('minecraft-data')
const { velocityCompatibility } = require('./velocity_compat')
const { spectatorCompatibility } = require('./spectator_compat')
const { raycastCompatibility } = require('./raycast_compat')
const { ActionExecutor, cancelled } = require('./action_executor')
const { craftTimeoutMs } = require('../commands/craft_timing')
const { validateArguments, normalizeFailure, exceptionFailure } = require('../commands/command_contract')

class SteveXAgent {
  /**
   * @param {object} config - agent 配置对象
   * @param {string} name - agent 名称
   * @param {object} [commands] - 共享命令表 { name -> handler }，由 AgentManager 传入
   */
  constructor(config, name = 'steveX', commands = {}, options = {}) {
    this.config = config
    this.name = name
    this.bot = null
    this.movements = null
    this.commands = commands
    this.connected = false
    this.connecting = false
    this.queryNames = options.queryNames || new Set()
    this.executor = new ActionExecutor(() => this.stopPhysicalActions())
    this.renderService = options.renderService || null
    this.observationRevision = 0
    this.sessionId = require('node:crypto').randomUUID()
    const { InteractionMemory } = require('./interaction_memory')
    this.interactionMemory = new InteractionMemory({ agentName: name,
      agentId: config.renderer?.agentId || name, sessionId: this.sessionId,
      memoryNamespace: options.memoryNamespace || `session-${this.sessionId}`,
      server: { host: config.minecraft?.host, port: config.minecraft?.port || 25565 } })

    // Current action shown on the web console.
    // It will be updated when a command is running.
    this.currentAction = 'Idle'
  }

  start() {
    const mc = this.config.minecraft

    this.connecting = true
    this.currentAction = 'Connecting'

    this.bot = mineflayer.createBot({
      host: mc.host,
      port: mc.port,
      username: mc.username,
      auth: mc.auth,
      version: mc.version
    })

    this.bot.loadPlugin(pathfinder)
    // Load after Mineflayer's built-ins so this corrects their legacy scaling.
    this.bot.loadPlugin(velocityCompatibility)
    this.bot.loadPlugin(spectatorCompatibility)
    this.bot.loadPlugin(raycastCompatibility)
    this.registerEvents()
  }

  registerEvents() {
    this.bot.once('spawn', () => {
      require('../commands/workstations').attach(this.bot)
      this.interactionMemory.attach(this.bot)
      this.connected = true
      this.connecting = false
      this.currentAction = 'Idle'

      console.log(`[info](${this.name}) Bot spawned `)

      const mcData = mcDataLoader(this.bot.version)
      this.movements = new Movements(this.bot, mcData)
      this.bot.pathfinder.setMovements(this.movements)
    })

    // 统一断连处理：end/kicked 都标记为离线
    const onDisconnect = (reason) => {
      this.interactionMemory.close()
      this.brainLoop?.stop()
      this.executor.close()
      this.stopPhysicalActions()
      this.connecting = false
      this.connected = false
      this.currentAction = 'Offline'

      if (reason) {
        console.error(`[error](${this.name}) Bot disconnected`, reason)
      }
    }

    this.bot.on('end', () => onDisconnect())

    this.bot.on('kicked', (reason) => {
      onDisconnect(reason)
    })

    this.bot.on('error', (error) => {
      this.currentAction = 'Error'
      console.error(`[error](${this.name}) Bot error`, error)
    })
  }

  /**
   * Execute a mineflayer command for this agent.
   * Commands are registered via registerCommand().
   * @param {string} input - raw command string
   * @returns {Promise<{ok:boolean,output?:string,error?:string}>}
   */
  async executeCommand(input, options = {}) {
    const requested = typeof input === 'string' ? input.trim().split(/\s+/)[0].toLowerCase() : ''
    if (!this.bot || !this.connected) {
      return normalizeFailure(requested, {
        ok: false,
        errorCode: 'NOT_CONNECTED',
        error: 'Bot not started'
      })
    }

    const trimmed = typeof input === 'string' ? input.trim() : ''

    if (!trimmed) {
      return {
        ok: false,
        error: 'Empty command'
      }
    }

    const parts = trimmed.split(/\s+/)
    const command = parts[0].toLowerCase()
    const args = parts.slice(1)

    const handler = Object.hasOwn(this.commands, command) ? this.commands[command] : null

    if (!handler) {
      const available = Object.keys(this.commands).sort().join(', ')

      return {
        ok: false,
        error: `Unknown command: ${command}. Available: ${available}`
      }
    }

    const invalid = validateArguments(command, args)
    if (invalid) return invalid

    let operationOutcome
    try {
      options.signal?.throwIfAborted()
      if (this.queryNames.has(command)) return normalizeFailure(command, await handler.call(this, this.bot, args, this, options))
      if (options.source !== 'brain') this.brainLoop?.stop()
      if (command === 'stopdig') {
        const task = this.executor.active
        if (task && ['dig', 'mine'].includes(task.name)) task.controller.abort(cancelled('Digging stopped'))
        return normalizeFailure(command, await handler.call(this, this.bot, args, this, options))
      }
      if (command === 'stop') {
        this.brainLoop?.stop()
        this.executor.cancelAll('Stop requested')
        this.stopPhysicalActions()
        return { ok: true, output: 'Actions and autonomous brain stopped' }
      }
      return await this.executor.run(command, async signal => {
        if (!this.connected) throw new Error('Agent is offline')
        this.stopPhysicalActions()
        this.currentAction = command
        try {
          const result = await handler.call(this, this.bot, args, this, { ...options, signal })
          if (require('../commands/operation_result').operationNames.has(command)) operationOutcome = result
          if (result?.status === 'RUNNING') this.backgroundSource = options.source || 'manual'
          return normalizeFailure(command, result)
        }
        finally {
          if (signal.aborted) this.stopPhysicalActions()
          this.currentAction = this.connected ? (this.bot?._followCleanup ? 'follow' : 'Idle') : 'Offline'
        }
      }, { ...options, timeoutMs: options.timeoutMs ?? this.config.runtime?.actionTimeoutMs ?? (command === 'craft' ? craftTimeoutMs(args) : 30000) })
    } catch (err) {
      if (err.name !== 'AbortError') console.error(`[error](${this.name}) Command error`, err)

      const operations = require('../commands/operation_result')
      if (operations.operationNames.has(command)) {
        const failure = exceptionFailure(command,err,options.signal)
        let output = operationOutcome?.output || failure.output
        const oldPrefix = `[${operationOutcome?.errorCode}] `
        if (output?.startsWith(oldPrefix)) output = output.slice(oldPrefix.length)
        return normalizeFailure(command, operations.result(command, { ...operationOutcome, ...failure, output }))
      }

      return exceptionFailure(command,err,options.signal)
    }
  }

  stopPhysicalActions() {
    const bot = this.bot
    if (!bot) return
    if (bot._followInterval) { clearInterval(bot._followInterval); bot._followInterval = null }
    bot._followCleanup?.()
    this.backgroundSource = null
    if (this.connected && !this.executor.active) this.currentAction = 'Idle'
    for (const stop of [() => bot.pathfinder?.setGoal(null), () => bot.clearControlStates?.(),
      () => bot.stopDigging?.(), () => bot.deactivateItem?.()]) {
      try { stop()?.catch?.(() => {}) } catch (_) {}
    }
  }

  stopBrainActions() {
    if (this.backgroundSource === 'brain') this.stopPhysicalActions()
  }

  async captureObservation(options = {}) {
    if (!this.renderService) return { ok: false, error: 'Shared renderer is disabled' }
    try {
      const frame = await this.executor.run('capture', async signal => {
        if (!this.isOnline()) throw new Error('Agent is offline')
        this.stopPhysicalActions()
        this.currentAction = 'capture'
        try { return await this.renderService.capture(this, signal) }
        finally { this.currentAction = this.connected ? 'Idle' : 'Offline' }
      }, { ...options, timeoutMs: this.renderService.timeoutMs || 60000 })
      return { ok: true, observation: { agentId: frame.agentId, agentName: this.name, sessionId: this.sessionId, revision: ++this.observationRevision,
        observedAt: new Date(frame.timestamp).toISOString(), sources: ['rgb', 'depth', 'client-nbt'], frame } }
    } catch (error) { return { ok: false, cancelled: error.name === 'AbortError', error: error.message } }
  }

  /** Whether the bot is connected and spawned. */
  startBrain(opts = {}, bus = null) {
    if (this.brainLoop) return this.brainLoop.start()
    const { Brain } = require('./brain')
    const llmCfg = this.config?.llm || {}
    this.brainLoop = new Brain(this, llmCfg, bus || { emit: () => {} }, opts)
    return this.brainLoop.start()
  }

  isOnline() {
    return this.bot && this.connected
  }

  /** Whether the bot is in the connection handshake. */
  isConnecting() {
    return this.bot && this.connecting
  }

  /** The in-game username, falling back to config. */
  getUsername() {
    return this.bot ? this.bot.username : this.config.minecraft.username
  }

  /** The current action shown in web console. */
  getCurrentAction() {
    return this.currentAction
  }

  /** Gracefully disconnect the bot from the server. */
  shutdown() {
    this.interactionMemory.close()
    if (this.brainLoop) {
      this.brainLoop.stop()
      this.brainLoop = null
    }
    this.executor.close()
    this.stopPhysicalActions()

    if (this.bot) {
      if (this.bot._followInterval) {
        clearInterval(this.bot._followInterval)
        this.bot._followInterval = null
      }
      this.currentAction = 'Disconnecting'
      this.bot.end()
    }

    this.connected = false
    this.connecting = false
    this.currentAction = 'Offline'
  }
}

module.exports = {
  SteveXAgent
}
