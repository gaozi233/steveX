function nearbyDetails(bot, entity) {
  const keys = bot.registry?.entitiesByName?.[entity.name]?.metadataKeys || []
  const metadata = key => { const index = keys.indexOf(key); return index < 0 ? undefined : entity.metadata?.[index] }
  const dropped = ['item','Item','item_stack'].includes(entity.name)
  const frame = ['item_frame','glow_item_frame'].includes(entity.name)
  const result = {}
  if (dropped || frame) {
    try {
      const raw = metadata('item')
      const item = dropped && typeof entity.getDroppedItem === 'function' ? entity.getDroppedItem() : raw === undefined ? null : require('prismarine-item')(bot.registry).fromNotch(raw)
      if (item?.name && Number.isInteger(item.count) && item.count > 0) result.item = { name:item.name,count:item.count }
    } catch { /* Missing or not-yet-synchronized item metadata is unknown. */ }
  }
  if (frame) {
    const rotation = metadata('rotation')
    if (Number.isInteger(rotation) && rotation >= 0 && rotation <= 7) result.rotationDegrees = rotation * 45
  }
  if (['arrow','spectral_arrow','trident'].includes(entity.name)) {
    const inGround = metadata('in_ground')
    if (typeof inGround === 'boolean' || inGround === 0 || inGround === 1) result.inGround = Boolean(inGround)
  }
  return result
}
module.exports = { nearbyDetails }
