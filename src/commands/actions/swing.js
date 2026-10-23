/**
 * swing [hand] — swing arm animation
 * hand: right (default) or left
 */
module.exports = {
  name: 'swing',
  description: 'Animation only: hand (default) or off-hand; never attacks, digs, uses items or interacts. Not a mouse-button press',
  usage: 'swing [hand|off-hand]',
  async handler(bot, args) {
    const hand = args[0] || 'hand'
    bot.swingArm(hand === 'off-hand' ? 'left' : 'right')
    return { ok: true, output: `Swung ${hand} arm` }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
