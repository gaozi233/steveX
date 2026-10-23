/**
 * move <direction> [durationMs] — set movement control state
 * direction: forward, back, left, right, sprint
 * durationMs: optional, auto-stop after ms (default: 1000)
 */
const { sleep } = require('../../agent/action_executor')
module.exports = {
  name: 'move',
  description: 'Queued movement: hold a direction for 1..30000ms, then release. Queued move stop stops movement/pathfinding and preserves persistent sneak and held-item use; no duration allowed. Unlike immediate global stop, does not cancel the queue or end Brain; wait only waits. Riding directions steer vehicles; sprint unsupported while riding',
  usage: 'move <forward|back|left|right|sprint|stop> [durationMs]',
  async handler(bot, args, agent, { signal } = {}) {
    if (args.length < 1) return { ok: false, error: 'Usage: move <forward|back|left|right|sprint> [durationMs]' }
    const control = args[0].toLowerCase()
    if (control === 'stop') {
      if (args.length !== 1) return { ok: false, errorCode: 'INVALID_ARGUMENTS', error: 'move stop takes no duration' }
      bot.clearControlStates()
      return { ok: true, output: 'Movement stopped; persistent sneak and held-item use preserved' }
    }
    const valid = ['forward', 'back', 'left', 'right', 'sprint']
    if (!valid.includes(control)) return { ok: false, error: `Invalid direction. Valid: ${valid.join(', ')}` }
    const duration = args[1] === undefined ? 1000 : (/^\d+$/.test(args[1]) ? Number(args[1]) : NaN)
    if (!Number.isInteger(duration) || duration < 1 || duration > 30000) return { ok: false, error: 'Duration must be 1..30000 ms' }

    if (bot.vehicle) {
      if (control === 'sprint') return { ok: false, errorCode: 'UNSUPPORTED_CONTROL', error: 'Vehicle movement supports forward/back/left/right, not sprint' }
      const vehicle = bot.vehicle
      const { steerVehicle } = require('../../agent/vehicle_input')
      try {
        steerVehicle(bot, control)
        await sleep(duration, signal)
      } finally {
        if (bot.vehicle === vehicle) steerVehicle(bot)
      }
      return { ok: true, output: `Released vehicle ${control} after ${duration}ms; travel distance not guaranteed`, control, durationMs: duration, mode: 'vehicle' }
    }
    bot.setControlState(control, true)

    try { await sleep(duration, signal) }
    finally { bot.setControlState(control, false) }

    return { ok: true, output: `Released ${control} after ${duration}ms`, control, durationMs: duration }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
