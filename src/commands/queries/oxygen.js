/**
 * oxygen — show oxygen level
 */
module.exports = {
  name: 'oxygen',
  description: 'Show oxygen level',
  usage: 'oxygen',
  async handler(bot) {
    const oxygen = bot.oxygenLevel ?? null
    return { ok: true, output: `Oxygen: ${oxygen ?? '?'}/20`, oxygen, maxOxygen: 20 }
  }
}
