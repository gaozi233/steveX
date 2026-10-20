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
    this.history = []
    this.running = false
    this.timer = null
    const list = loadCommands().list
    this.table = list
      .map(c => `${c.name}${c.usage && c.usage !== c.name ? ' ' + c.usage.replace(c.name + ' ', '') : ''}`)
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

  async gatherState() {
    const lines = []
    for (const q of STATE_QUERIES) {
      try {
        const r = await this.agent.executeCommand(q)
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
    if (!raw) return null
    const names = new Set(this.table.split('\n').map((l) => l.trim().split(/\s+/)[0]))
    const cleaned = raw.replace(/```/g, '').replace(/^>+/gm, '')
    for (const lineRaw of cleaned.split('\n')) {
      const line = lineRaw.trim()
      if (!line) continue
      const first = line.split(/\s+/)[0].toLowerCase()
      if (names.has(first)) return line
    }
    return null
  }

  async tick() {
    try {
      const state = await this.gatherState()
      const messages = [
        { role: 'system', content: this.buildSystem() },
        { role: 'user', content: state },
      ]
      this.bus.emit('agent:llm:input', { name: this.agent.name, input: state })
      const out = await this.llm.chat(messages)
      this.bus.emit('agent:llm:output', { name: this.agent.name, output: out })
      const cmd = this.pickCommand(out)
      if (!cmd) {
        this.history.push(['(no valid command)', String(out).slice(0, 80)])
        return
      }
      const res = await this.agent.executeCommand(cmd)
      const outcome = res && res.ok ? (res.output || 'ok') : `FAILED ${(res?.error || '')}`
      this.history.push([cmd, String(outcome).slice(0, 120)])
      if (this.history.length > 10) this.history.shift()
      console.log(`[brain](${this.agent.name}) ${cmd} -> ${String(outcome).slice(0, 100)}`)
    } catch (e) {
      console.log(`[brain](${this.agent.name}) tick error: ${String(e.message).slice(0, 120)}`)
    }
  }

  start() {
    if (this.running) return
    this.running = true
    const loop = async () => {
      if (!this.running) return
      if (!this.agent.isOnline()) {
        this.timer = setTimeout(loop, this.intervalMs)
        return
      }
      await this.tick()
      if (this.running) this.timer = setTimeout(loop, this.intervalMs)
    }
    this.timer = setTimeout(loop, 2000)
  }

  stop() {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}

module.exports = { Brain }
