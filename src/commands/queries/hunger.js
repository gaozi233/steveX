/**
 * hunger — show food level and saturation
 */
const { foodState } = require('../../agent/food_state')

module.exports = {
  name: 'hunger',
  description: 'Show food and last-known saturation; include active hunger effect level and duration source only when present',
  usage: 'hunger',
  async handler(bot) {
    const state = foodState(bot)
    const { effectText = '', ...effects } = require('../../agent/hud_effects').hudEffects(bot, ['hunger'])
    const note = state.saturation === null ? '' : ' (last known)'
    return { ok: true, output: `Hunger: ${state.food ?? '?'}/20 | Saturation: ${state.saturation?.toFixed(1) ?? '?'}${note}${effectText}`, ...state, ...effects }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
