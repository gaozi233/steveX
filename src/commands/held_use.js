const active = new WeakMap()

function clearUse(bot) {
  const state = active.get(bot)
  if (state) {
    bot.removeListener('heldItemChanged', state.changed)
    bot.inventory?.removeListener?.('updateSlot', state.slotChanged)
    bot.removeListener('end', state.clear)
    bot._client?.removeListener('entity_status', state.status)
    active.delete(bot)
  }
}

function hasUse(bot) { return active.has(bot) || !!bot.usingHeldItem }

function usedItem(bot, hand = 'hand') {
  return hand === 'off-hand' ? bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')] : bot.heldItem
}

function crossbowCharged(item) {
  return item?.name === 'crossbow' && (item.components?.find(c => c.type === 'charged_projectiles')?.data?.projectiles?.length || 0) > 0
}

function startUse(bot, hand = 'hand') {
  clearUse(bot)
  const item = usedItem(bot,hand)
  const type = item.type, count = item.count
  const charged = crossbowCharged(item)
  const clear = () => clearUse(bot)
  const finish = () => { clear(); bot.usingHeldItem = false }
  // Crossbows keep their type/count both on loading and on firing. Unlike a
  // shield's durability update, charged-projectile transitions end that use.
  const check = next => {
    if (crossbowCharged(next) !== charged) {
      // End the server-side hold too: otherwise it can begin another load
      // after firing even though our local request has already completed.
      try { bot.deactivateItem() } finally { finish() }
    } else if (next?.type !== type || next?.count !== count) finish()
  }
  const changed = next => { if (hand === 'hand') check(next) }
  const slotChanged = slot => { if (hand === 'off-hand' && slot === bot.getEquipmentDestSlot('off-hand')) check(usedItem(bot,hand)) }
  const status = packet => {
    if (packet.entityId === bot.entity?.id && packet.entityStatus === 9) finish()
  }
  // Mineflayer also clears usingHeldItem on unrelated entity-status packets.
  active.set(bot, { changed, slotChanged, clear, status })
  bot.on('heldItemChanged', changed)
  bot.inventory?.on?.('updateSlot',slotChanged)
  bot.once('end', clear)
  bot._client?.on('entity_status', status)
  try { bot.activateItem(hand === 'off-hand') } catch (error) { clear(); throw error }
}

function releaseUse(bot) {
  const requested = hasUse(bot)
  if (requested) bot.deactivateItem()
  clearUse(bot)
  return requested
}

module.exports = { clearUse, hasUse, startUse, releaseUse, usedItem }
