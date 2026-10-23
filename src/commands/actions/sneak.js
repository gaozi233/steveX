const { withContract } = require('../command_contract')
const { sleep } = require('../../agent/action_executor')
const { setSneakHold, isSneakHeld } = require('../../agent/sneak_state')
module.exports = {
  name: 'sneak',
  description: 'Keyboard sneak: on holds across movement, turning and right-click; off releases; tap presses for 150ms then releases (may dismount). tap while already held is a no-op. stop/cancellation clears the hold. Client input acknowledgement, not server effect confirmation',
  usage: 'sneak <on|off|tap>',
  handler: withContract('sneak', async (bot, args, agent, { signal } = {}) => {
    const mode = args[0]
    if (mode === 'tap') {
      if (isSneakHeld(bot) || bot.getControlState('sneak')) return { ok: true, changed: false, sneaking: true, output: 'Sneak already held; tap did not release it' }
      bot.setControlState('sneak', true)
      try { await sleep(150, signal) }
      finally { bot.setControlState('sneak', false) }
      return { ok: true, requested: true, sneaking: false, confirmation: 'request-sent-only', output: 'Sneak tapped for 150ms and released; verify vehicle state if dismounting' }
    }
    setSneakHold(bot, mode === 'on')
    return { ok: true, requested: true, sneaking: mode === 'on', confirmation: 'request-sent-only', output: `Sneak ${mode}; ${mode === 'on' ? 'held until sneak off or safety stop' : 'released'}` }
  })
}
