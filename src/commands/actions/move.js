/**
 * move <direction> [durationMs] — set movement control state
 * direction: forward, back, left, right, sprint, sneak
 * durationMs: optional, auto-stop after ms (default: 1000)
 */
const { sleep } = require('../../agent/action_executor')
module.exports = {
  name: 'move',
  description: 'Hold one movement control for 1..30000 milliseconds, then release it; sprint/sneak alone do not move',
  usage: 'move <forward|back|left|right|sprint|sneak> [durationMs]',
  async handler(bot, args, agent, { signal } = {}) {
    if (args.length < 1) return { ok: false, error: 'Usage: move <forward|back|left|right|sprint|sneak> [durationMs]' }
    const control = args[0].toLowerCase()
    const valid = ['forward', 'back', 'left', 'right', 'sprint', 'sneak']
    if (!valid.includes(control)) return { ok: false, error: `Invalid direction. Valid: ${valid.join(', ')}` }
    const duration = args[1] === undefined ? 1000 : (/^\d+$/.test(args[1]) ? Number(args[1]) : NaN)
    if (!Number.isInteger(duration) || duration < 1 || duration > 30000) return { ok: false, error: 'Duration must be 1..30000 ms' }

    bot.setControlState(control, true)

    try { await sleep(duration, signal) }
    finally { bot.setControlState(control, false) }

    return { ok: true, output: `Released ${control} after ${duration}ms`, control, durationMs: duration }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
