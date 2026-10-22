const { Vec3 } = require('vec3')
const installedVersion = require('mineflayer/package.json').version

function raycastCompatibility(bot) {
  if (installedVersion !== '4.39.0') return false
  const original = bot.blockAtEntityCursor
  // Upstream's truthiness guard rejects valid zero yaw/pitch. Preserve other paths.
  const wrapped = (entity = bot.entity, maxDistance = 256, matcher = null) => {
    if (entity?.yaw !== 0 && entity?.pitch !== 0) return original(entity, maxDistance, matcher)
    if (!entity?.position || ![entity.height, entity.pitch, entity.yaw].every(Number.isFinite) || entity.height <= 0) return null
    const { pitch, yaw } = entity
    const direction = new Vec3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
    return bot.world.raycast(entity.position.offset(0, entity.height, 0), direction, maxDistance, matcher)
  }
  bot.blockAtEntityCursor = wrapped
  bot.once('end', () => { if (bot.blockAtEntityCursor === wrapped) bot.blockAtEntityCursor = original })
  return true
}
module.exports = { raycastCompatibility }
