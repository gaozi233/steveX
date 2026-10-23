/**
 * swing [hand] — swing arm animation
 * hand: right (default) or left
 */
module.exports = {
  name: 'swing',
  description: 'Animation only: send a main/right or off/left arm swing packet; never attacks, digs, uses items or interacts. Not a mouse-button press',
  usage: 'swing [hand]',
  async handler(bot, args) {
    const hand = args[0] === 'left' ? 'left' : 'right'
    bot.swingArm(hand)
    return { ok: true, output: `Swung ${hand} arm` }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
