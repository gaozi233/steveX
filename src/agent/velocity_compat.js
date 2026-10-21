const LP_VEC3_VELOCITY_VERSIONS = new Set(['1.21.11'])

function velocityCompatibility(bot) {
  if (!LP_VEC3_VELOCITY_VERSIONS.has(bot.version)) return false

  let ownOxygenLevel = null

  const airKey = bot.registry?.entitiesByName?.player?.metadataKeys?.indexOf('air_supply') ?? 1
  const setAir = raw => {
    if (typeof raw === 'number' && Number.isFinite(raw)) ownOxygenLevel = Math.max(0, Math.min(20, Math.round(raw / 15)))
    bot.oxygenLevel = ownOxygenLevel
  }

  bot.once('spawn', () => setAir(bot.entity?.metadata?.[airKey]))

  bot._client.on('entity_velocity', (packet) => {
    const entity = bot.entities[packet.entityId]
    if (!entity?.velocity || !packet.velocity) return

    // 1.21.11 lpVec3 values are already expressed in blocks per tick.
    entity.velocity.set(packet.velocity.x, packet.velocity.y, packet.velocity.z)
  })

  bot._client.on('entity_metadata', (packet) => {
    if (!bot.entity) return

    const air = packet.entityId === bot.entity.id ? packet.metadata?.find(entry => entry.key === airKey) : null
    // Use the body's raw air ticks, never infer a scale from another entity's reading.
    setAir(air?.value)
  })

  return true
}

module.exports = { velocityCompatibility }
