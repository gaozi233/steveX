/**
 * weather — show weather state
 */
module.exports = {
  name: 'weather',
  description: 'Show current weather',
  usage: 'weather',
  async handler(bot) {
    const finite = value => typeof value === 'number' && Number.isFinite(value)
    const rainStrength = finite(bot.rainState) ? bot.rainState : null
    const thunderStrength = finite(bot.thunderState) ? bot.thunderState : null
    const weather = typeof bot.isRaining !== 'boolean' ? null : !bot.isRaining ? 'clear' : thunderStrength > 0 ? 'thunder' : 'raining'
    return { ok: true, output: `Weather: ${weather ?? '?'}`, weather, rainStrength, thunderStrength }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
