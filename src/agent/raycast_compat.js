const { Vec3 } = require('vec3')
const installedVersion = require('mineflayer/package.json').version

function raycastCompatibility(bot) {
  if (installedVersion !== '4.39.0') return false
  const original = bot.blockAtEntityCursor
  // 4.39.0 rejects zero angles and rays from body height rather than lookAt's eye.
  const wrapped = (entity = bot.entity, maxDistance = 256, matcher = null) => {
    if (entity?.eyeHeight === undefined && entity?.yaw !== 0 && entity?.pitch !== 0) return original(entity, maxDistance, matcher)
    const eyeHeight = entity?.eyeHeight ?? entity?.height
    if (!entity?.position || ![eyeHeight, entity.pitch, entity.yaw].every(Number.isFinite) || eyeHeight <= 0) return null
    const { pitch, yaw } = entity
    const direction = new Vec3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
    return bot.world.raycast(entity.position.offset(0, eyeHeight, 0), direction, maxDistance, matcher)
  }
  bot.blockAtEntityCursor = wrapped
  bot.once('end', () => { if (bot.blockAtEntityCursor === wrapped) bot.blockAtEntityCursor = original })
  return true
}
module.exports = { raycastCompatibility }
