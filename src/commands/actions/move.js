/**
 * move <direction> [durationMs] — set movement control state
 * direction: forward, back, left, right, sprint, sneak
 * durationMs: optional, auto-stop after ms (default: 1000)
 */
const { sleep } = require('../../agent/action_executor')
module.exports = {
  name: 'move',
  description: 'Set movement control state',
  usage: 'move <forward|back|left|right|sprint|sneak> [durationMs]',
  async handler(bot, args, agent, { signal } = {}) {
    if (args.length < 1) return { ok: false, error: 'Usage: move <forward|back|left|right|sprint|sneak> [durationMs]' }
    const control = args[0].toLowerCase()
    const valid = ['forward', 'back', 'left', 'right', 'sprint', 'sneak']
    if (!valid.includes(control)) return { ok: false, error: `Invalid direction. Valid: ${valid.join(', ')}` }
    const duration = args[1] ? parseInt(args[1], 10) : 1000
    if (!Number.isInteger(duration) || duration < 1 || duration > 30000) return { ok: false, error: 'Duration must be 1..30000 ms' }

    bot.setControlState(control, true)

    try { await sleep(duration, signal) }
    finally { bot.setControlState(control, false) }

    const sec = (duration / 1000).toFixed(1)
    return { ok: true, output: `Moving ${control} for ${sec}s` }
  }
}
