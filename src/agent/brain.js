/*
 * brain.js — autonomous LLM loop for SteveX agents.
 * State -> single command per tick; reuses vendor DeepSeekClient (OpenAI-compatible).
 * Config: agent cfg may carry cfg.brain = { enabled, goal, intervalMs }
 */
const { DeepSeekClient } = require('../llm/deepseek_client')
const { loadCommands } = require('../commands')

const STATE_QUERIES = ['pos', 'hp', 'inventory', 'nearby', 'time']

class Brain {
  constructor(agent, llmCfg, bus, opts = {}) {
    this.agent = agent
    this.bus = bus
    this.llm = new DeepSeekClient({
      apiKey: llmCfg.apiKey || '',
      model: llmCfg.model,
      baseUrl: llmCfg.baseUrl,
      timeoutMs: llmCfg.timeoutMs || 60000,
    })
    this.goal = opts.goal || 'reach the Endgame (Endportal)'
    this.intervalMs = opts.intervalMs || 5000
    if (!Number.isFinite(this.intervalMs) || this.intervalMs <= 0) throw new Error('Invalid brain intervalMs')
    this.history = []
    this.running = false
    this.timer = null
    this.generation = 0
    this.controller = new AbortController()
    this.inFlight = null
    this.lastError = null
    const allowed = opts.allowedCommands ? new Set(opts.allowedCommands) : null
    const list = loadCommands().list.filter(c => (!agent.commands || agent.commands[c.name])
      && (allowed ? allowed.has(c.name) : c.kind !== 'creative'))
    this.table = list
      .map(c => `${c.name}${c.usage && c.usage !== c.name ? ' ' + c.usage.replace(c.name + ' ', '') : ''}${c.description ? ' -- ' + c.description : ''}`)
      .join('\n')
  }

  buildSystem() {
    return [
      'You are JeVBot, a Minecraft bot (mineflayer) in a LAN world, Minecraft 1.21.x.',
      `GOAL: ${this.goal}. Helpful chain: collect wood logs, craft oak_planks and stick, craft torch, craft wooden_pickaxe, equip it, dig/mine stone, findblock ironstone (or iron ore), smelt via furnace (furnace command), craft iron tools, build shelter, then explore outward with goto to locate the Endportal.`,
      'Reply with EXACTLY ONE command line from the list below, nothing else — no prose, no quotes, no markdown.',
      'Never repeat a command that just failed; if stuck, say something via say <text> or explore with goto <x> <y> <z>.',
      'COMMANDS:',
      this.table,
    ].join('\n')
  }

  async gatherState(signal) {
    const lines = []
    for (const q of STATE_QUERIES) {
      signal?.throwIfAborted()
      try {
        const r = await this.agent.executeCommand(q, { source: 'brain', signal })
        if (r && r.ok && r.output) lines.push(`${q}: ${r.output}`)
        else if (r && r.error) lines.push(`${q}: ERROR ${r.error}`)
      } catch (e) {
        lines.push(`${q}: ERROR ${e.message}`)
      }
    }
    const hist = this.history
      .map(([c, res]) => `${c} -> ${res}`)
      .join('\n')
    return `STATE:\n${lines.join('\n')}\n\nRECENT HISTORY:\n${hist}\n\nGOAL: ${this.goal}\nReply with ONE command:`
  }

  pickCommand(raw) {
    if (typeof raw !== 'string' || raw.length > 4096) return null
    const names = new Set(this.table.split('\n').map((l) => l.trim().split(/\s+/)[0]))
    const cleaned = raw.trim().replace(/^```\w*\s*\n?/, '').replace(/\n?```$/, '')
    const lines = cleaned.split('\n').map(line => line.trim()).filter(Boolean)
    if (lines.length !== 1) return null
    for (const lineRaw of lines) {
      const line = lineRaw.trim()
      if (!line) continue
      const first = line.split(/\s+/)[0].toLowerCase()
      if (names.has(first)) return line
    }
    return null
  }

  active(generation, signal) {
    return this.running && this.generation === generation && !signal.aborted && this.agent.isOnline()
  }

  remember(command, result) {
    this.history.push([command, String(result).slice(0, 120)])
    if (this.history.length > 10) this.history.splice(0, this.history.length - 10)
  }

  async tick(generation = this.generation, signal = this.controller.signal) {
    try {
      if (!this.active(generation, signal)) return
      const state = await this.gatherState(signal)
      if (!this.active(generation, signal)) return
      const messages = [
        { role: 'system', content: this.buildSystem() },
        { role: 'user', content: state },
      ]
      this.bus.emit('agent:llm:input', { name: this.agent.name, input: state, prompt: state, model: this.llm.model, timestamp: Date.now() })
      const out = await this.llm.chat(messages, { signal })
      if (!this.active(generation, signal)) return
      this.bus.emit('agent:llm:output', { name: this.agent.name, output: out, response: out, model: this.llm.model, timestamp: Date.now() })
      const cmd = this.pickCommand(out)
      if (!cmd) {
        this.remember('(no valid command)', out)
        return
      }
      const res = await this.agent.executeCommand(cmd, { source: 'brain', signal })
      if (!this.active(generation, signal)) return
      const outcome = res && res.ok ? (res.output || 'ok') : `FAILED ${(res?.error || '')}`
      this.remember(cmd, outcome)
      console.log(`[brain](${this.agent.name}) ${cmd} -> ${String(outcome).slice(0, 100)}`)
    } catch (e) {
      if (!this.active(generation, signal)) return
      this.lastError = e.message
      console.log(`[brain](${this.agent.name}) tick error: ${String(e.message).slice(0, 120)}`)
    }
  }

  start() {
    if (this.running) return true
    if (!this.llm.apiKey) { this.lastError = 'LLM disabled: missing API key'; return false }
    this.running = true
    this.lastError = null
    const generation = ++this.generation
    this.controller = new AbortController()
    const signal = this.controller.signal
    const loop = async () => {
      if (!this.running || this.generation !== generation) return
      if (!this.agent.isOnline()) {
        this.timer = setTimeout(loop, this.intervalMs)
        return
      }
      if (this.inFlight) await this.inFlight
      if (!this.active(generation, signal)) return
      const work = this.tick(generation, signal)
      this.inFlight = work
      await work
      if (this.inFlight === work) this.inFlight = null
      if (this.active(generation, signal)) this.timer = setTimeout(loop, this.intervalMs)
    }
    this.timer = setTimeout(loop, 2000)
    return true
  }

  stop() {
    this.running = false
    this.generation++
    this.controller.abort(new Error('Brain stopped'))
    this.agent.stopBrainActions?.()
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}

module.exports = { Brain }
