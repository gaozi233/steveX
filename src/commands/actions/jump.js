/**
 * jump — make the bot jump
 */
const { sleep } = require('../../agent/action_executor')
module.exports = {
  name: 'jump',
  description: 'Hold jump for 200ms, then release; requires support/headroom and does not wait for landing',
  usage: 'jump',
  async handler(bot, args, agent, { signal } = {}) {
    bot.setControlState('jump', true)
    try { await sleep(200, signal) }
    finally { bot.setControlState('jump', false) }
    return { ok: true, output: 'Released jump after 200ms; landing not awaited' }
  }
}
