/**
 * hp — show health
 */
const { healthState } = require('../../agent/health_state')

module.exports = {
  name: 'hp',
  description: 'Show current health',
  usage: 'hp',
  async handler(bot) {
    const state = healthState(bot)
    const extra = state.absorption > 0 ? ` | Absorption: ${state.absorption}` : ''
    return { ok: true, output: `HP: ${state.health?.toFixed(1) ?? '?'}/${state.maxHealth ?? '?'}${extra}`, ...state }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
