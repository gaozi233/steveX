/**
 * lookat <x> <y> <z> — look at block/position
 */
const Vec3 = require('vec3').Vec3

module.exports = {
  name: 'lookat',
  description: 'Look at a position',
  usage: 'lookat <x> <y> <z>',
  async handler(bot, args) {
    if (args.length < 3) return { ok: false, error: 'Usage: lookat <x> <y> <z>' }
    const [lx, ly, lz] = args.map(Number)
    if (![lx, ly, lz].every(Number.isFinite)) return { ok: false, error: 'Coordinates must be finite numbers' }
    await bot.lookAt(new Vec3(lx, ly, lz))
    return { ok: true, output: `Looking at ${lx} ${ly} ${lz}` }
  }
}
