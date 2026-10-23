/**
 * jump — make the bot jump
 */
const { sleep } = require('../../agent/action_executor')
module.exports = {
  name: 'jump',
  description: 'Default/normal: hold jump for 200ms then release, landing not awaited. glide: request elytra deployment while airborne with elytra equipped; not confirmed flight',
  usage: 'jump [normal|glide]',
  async handler(bot, args, agent, { signal } = {}) {
    if (args[0] === 'glide') {
      if (bot.vehicle) return { ok: false, errorCode: 'RIDING_VEHICLE', error: 'Dismount before deploying elytra' }
      await bot.elytraFly()
      return { ok: true, confirmed: false, status: 'requested', output: 'Elytra deployment requested; verify flight state' }
    }
    bot.setControlState('jump', true)
    try { await sleep(200, signal) }
    finally { bot.setControlState('jump', false) }
    return { ok: true, output: 'Released jump after 200ms; landing not awaited' }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
