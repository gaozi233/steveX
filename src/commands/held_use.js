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
function useState(bot) {
  const state=active.get(bot)
  return { active: hasUse(bot), hand: state?.hand || null, item: state?.item || null }
}

function usedItem(bot, hand = 'hand') {
  return hand === 'off-hand' ? bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')] : bot.heldItem
}

function crossbowCharged(item) {
  return item?.name === 'crossbow' && (item.components?.find(c => c.type === 'charged_projectiles')?.data?.projectiles?.length || 0) > 0
}

function heldUseKind(bot, item) {
  if (!item) return 'unsupported'
  const components=new Set((item.components || []).map(c=>c.type.replace(/^minecraft:/,'')))
  if (['consumable','blocks_attacks','kinetic_weapon'].some(type=>components.has(type))) return 'sustained'
  if (item.name==='crossbow') return crossbowCharged(item)?'instant':'sustained'
  if (bot.registry?.foodsByName?.[item.name] || ['shield','bow','trident','spyglass','brush','goat_horn','potion','milk_bucket'].includes(item.name) || item.name.endsWith('_spear')) return 'sustained'
  if (/(?:_pickaxe|_axe|_shovel|_hoe|_sword)$/.test(item.name) || ['shears','stick'].includes(item.name)) return 'unsupported'
  // A single use packet does not establish a held-use lifecycle for unknown items.
  return 'instant-or-unknown'
}

function startUse(bot, hand = 'hand') {
  clearUse(bot)
  const item = usedItem(bot,hand)
  const useKind=heldUseKind(bot,item)
  if (useKind!=='sustained') {
    try { bot.activateItem(hand==='off-hand') } finally { bot.usingHeldItem=false }
    return {holdTracked:false,useKind}
  }
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
  active.set(bot, { hand, item:item.name, changed, slotChanged, clear, status })
  bot.on('heldItemChanged', changed)
  bot.inventory?.on?.('updateSlot',slotChanged)
  bot.once('end', clear)
  bot._client?.on('entity_status', status)
  try { bot.activateItem(hand === 'off-hand') } catch (error) { finish(); throw error }
  return {holdTracked:true,useKind}
}

function releaseUse(bot) {
  const requested = hasUse(bot)
  try { if (requested) bot.deactivateItem() }
  finally {
    clearUse(bot)
    if (requested) bot.usingHeldItem = false
  }
  return requested
}

module.exports = { clearUse, hasUse, useState, startUse, releaseUse, usedItem, heldUseKind }
