/**
 * jump — make the bot jump
 */
const { sleep } = require('../../agent/action_executor')
module.exports = {
  name: 'jump',
  description: 'Make the bot jump',
  usage: 'jump',
  async handler(bot, args, agent, { signal } = {}) {
    bot.setControlState('jump', true)
    try { await sleep(200, signal) }
    finally { bot.setControlState('jump', false) }
    return { ok: true, output: 'Jumped' }
  }
}
