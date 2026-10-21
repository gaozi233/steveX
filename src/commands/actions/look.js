/**
 * look <yaw> <pitch> — look at angle
 */
module.exports = {
  name: 'look',
  description: 'Set yaw and pitch in radians; yaw 0 faces -Z, pitch -PI/2..PI/2 (positive looks up)',
  usage: 'look <yaw> <pitch>',
  async handler(bot, args) {
    if (args.length < 2) return { ok: false, error: 'Usage: look <yaw> <pitch>' }
    const [yaw, pitch] = args.map(Number)
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || Math.abs(pitch) > Math.PI / 2) return { ok: false, error: 'Yaw/pitch must be finite radians; pitch must be -PI/2..PI/2' }
    await bot.look(yaw, pitch, true)
    return { ok: true, output: `Looked at yaw=${yaw} pitch=${pitch}` }
  }
}
