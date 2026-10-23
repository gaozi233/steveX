/**
 * hp — show health
 */
const { healthState } = require('../../agent/health_state')

module.exports = {
  name: 'hp',
  description: 'Show current/max health and positive absorption; relevant active effects include regeneration, poison, wither, health boost and absorption, with level and duration source; omit effects when absent',
  usage: 'hp',
  async handler(bot) {
    const state = healthState(bot)
    const { effectText = '', ...effects } = require('../../agent/hud_effects').hudEffects(bot, ['regeneration','poison','wither','health_boost','absorption'])
    const extra = state.absorption > 0 ? ` | Absorption: ${state.absorption}` : ''
    return { ok: true, output: `HP: ${state.health?.toFixed(1) ?? '?'}/${state.maxHealth ?? '?'}${extra}${effectText}`, ...state, ...effects }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
