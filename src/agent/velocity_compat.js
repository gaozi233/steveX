const LP_VEC3_VELOCITY_VERSIONS = new Set(['1.21.11'])

function velocityCompatibility(bot) {
  if (!LP_VEC3_VELOCITY_VERSIONS.has(bot.version)) return false

  let ownOxygenLevel = null

  const normalizeOxygen = () => {
    if (bot.oxygenLevel > 20) {
      bot.oxygenLevel = Math.max(0, Math.min(20, Math.round(bot.oxygenLevel / 20)))
    }
    if (bot.oxygenLevel != null) ownOxygenLevel = bot.oxygenLevel
  }

  bot.once('spawn', normalizeOxygen)

  bot._client.on('entity_velocity', (packet) => {
    const entity = bot.entities[packet.entityId]
    if (!entity?.velocity || !packet.velocity) return

    // 1.21.11 lpVec3 values are already expressed in blocks per tick.
    entity.velocity.set(packet.velocity.x, packet.velocity.y, packet.velocity.z)
  })

  bot._client.on('entity_metadata', (packet) => {
    if (!bot.entity) return

    if (packet.entityId === bot.entity.id) {
      // 1.21.11 reports 400 Mineflayer units for a full 20-icon air bar.
      normalizeOxygen()
    } else if (ownOxygenLevel != null) {
      // Mineflayer 4.39.0 updates bot.oxygenLevel from nearby entities too.
      bot.oxygenLevel = ownOxygenLevel
    }
  })

  return true
}

module.exports = { velocityCompatibility }
