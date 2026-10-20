/**
 * oxygen — show oxygen level
 */
module.exports = {
  name: 'oxygen',
  description: 'Show oxygen level',
  usage: 'oxygen',
  async handler(bot) {
    let oxygen = bot.oxygenLevel
    if (bot.version === '1.21.11' && oxygen > 20) oxygen = Math.round(oxygen / 20)
    return { ok: true, output: `Oxygen: ${oxygen ?? '?'}/20` }
  }
}
