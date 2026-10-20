const LP_VEC3_VELOCITY_VERSIONS = new Set(['1.21.11'])

function velocityCompatibility(bot) {
  if (!LP_VEC3_VELOCITY_VERSIONS.has(bot.version)) return false

  bot._client.on('entity_velocity', (packet) => {
    const entity = bot.entities[packet.entityId]
    if (!entity?.velocity || !packet.velocity) return

    // 1.21.11 lpVec3 values are already expressed in blocks per tick.
    entity.velocity.set(packet.velocity.x, packet.velocity.y, packet.velocity.z)
  })

  return true
}

module.exports = { velocityCompatibility }
