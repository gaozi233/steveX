/**
 * hunger — show food level and saturation
 */
const { foodState } = require('../../agent/food_state')

module.exports = {
  name: 'hunger',
  description: 'Show food level and last-known saturation from the health packet',
  usage: 'hunger',
  async handler(bot) {
    const state = foodState(bot)
    const note = state.saturation === null ? '' : ' (last known)'
    return { ok: true, output: `Hunger: ${state.food ?? '?'}/20 | Saturation: ${state.saturation?.toFixed(1) ?? '?'}${note}`, ...state }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
