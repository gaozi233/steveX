const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const mcDataLoader = require('minecraft-data')
const { velocityCompatibility } = require('./velocity_compat')

class SteveXAgent {
  /**
   * @param {object} config - agent 配置对象
   * @param {string} name - agent 名称
   * @param {object} [commands] - 共享命令表 { name -> handler }，由 AgentManager 传入
   */
  constructor(config, name = 'steveX', commands = {}) {
    this.config = config
    this.name = name
    this.bot = null
    this.movements = null
    this.commands = commands
    this.connected = false
    this.connecting = false

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
    this.registerEvents()
  }

  registerEvents() {
    this.bot.once('spawn', () => {
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
  async executeCommand(input) {
    if (!this.bot) {
      return {
        ok: false,
        error: 'Bot not started'
      }
    }

    const trimmed = input.trim()

    if (!trimmed) {
      return {
        ok: false,
        error: 'Empty command'
      }
    }

    const parts = trimmed.split(/\s+/)
    const command = parts[0].toLowerCase()
    const args = parts.slice(1)

    const handler = this.commands[command]

    if (!handler) {
      const available = Object.keys(this.commands).sort().join(', ')

      return {
        ok: false,
        error: `Unknown command: ${command}. Available: ${available}`
      }
    }

    // Let the web console show what the agent is doing.
    this.currentAction = command

    try {
      const result = await handler.call(this, this.bot, args, this)
      return result
    } catch (err) {
      console.error(`[error](${this.name}) Command error`, err)

      return {
        ok: false,
        error: err.message || String(err)
      }
    } finally {
      // Restore to idle after command finishes.
      // If the bot disconnected during the command, keep it as Offline.
      this.currentAction = this.connected ? 'Idle' : 'Offline'
    }
  }

  /** Whether the bot is connected and spawned. */
  startBrain(opts = {}, bus = null) {
    if (this.brainLoop) return
    const { Brain } = require('./brain')
    const llmCfg = this.config?.llm || {}
    this.brainLoop = new Brain(this, llmCfg, bus || { emit: () => {} }, opts)
    this.brainLoop.start()
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
    if (this.brainLoop) {
      this.brainLoop.stop()
      this.brainLoop = null
    }

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
