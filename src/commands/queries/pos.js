/**
 * pos — show current position and dimension
 */
module.exports = {
  name: 'pos',
  description: 'Show current position and dimension',
  usage: 'pos',
  async handler(bot) {
    const pos = bot.entity.position
    const dim = bot.game.dimension || 'unknown'
    const format = value => {
      const rounded = Math.sign(value) * Math.round(Math.abs(value) * 10) / 10
      return (rounded === 0 ? 0 : rounded).toFixed(1)
    }
    return { ok: true, output: `Position: ${format(pos.x)} ${format(pos.y)} ${format(pos.z)} | Dimension: ${dim}` }
  }
}
