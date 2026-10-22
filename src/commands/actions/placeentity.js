/** Place a held entity item without pathfinding, aiming or automatic retries. */
const { operation, aimedFace, position, counts, inventoryChanges, syncInventory, waitFor } = require('../operation_result')

function entityType(bot, item) {
  const name = item?.name || ''
  if (name === 'armor_stand' || name === 'end_crystal') return { name, boat: false }
  if (name.endsWith('_spawn_egg') && item.spawnEggMobName && bot.registry.entitiesByName[item.spawnEggMobName]) return { name: item.spawnEggMobName, boat: false }
  if (/(?:_boat|_raft)$/.test(name) && bot.registry.entitiesByName[name]) return { name, boat: true }
  return null
}
module.exports = {
  name: 'placeentity',
  description: 'Use held boat/raft, spawn egg, armor stand or end crystal at current aim; confirms a new matching spawn and item consumption; failure reports observed effects',
  usage: 'placeentity',
  handler: operation('placeentity', async (bot, args, agent, { signal } = {}) => {
    const reject = (errorCode, error) => ({ ok: false, errorCode, error, output: error, changes: [] })
    if (args.length) return reject('INVALID_ARGUMENTS', 'Usage: placeentity (no arguments)')
    if (bot.currentWindow) return reject('WINDOW_OPEN', 'Close the current inventory window before placing an entity')
    try { await syncInventory(bot) } catch (error) { return reject('INVENTORY_SYNC_FAILED', `Inventory not synchronized; no interaction sent: ${error.message}`) }
    const item = bot.heldItem, expected = entityType(bot, item)
    if (!expected) return reject('UNSUPPORTED_ITEM', 'Hold a supported boat/raft, spawn egg, armor stand or end crystal; paintings are not supported')
    const target = bot.blockAtCursor(4.5)
    if (!target) return reject('NO_TARGET', 'No block in sight within 4.5 blocks')
    if (!target.intersect || (expected.boat ? !bot.activateItem : !bot._genericPlace)) return reject('INTERACTION_UNAVAILABLE', 'Precise native entity interaction unavailable')
    if (item.name === 'end_crystal' && !['obsidian', 'bedrock'].includes(target.name)) return reject('INVALID_SURFACE', 'End crystals require an obsidian or bedrock base; no interaction sent')
    const face = aimedFace(target), before = counts(bot), existing = new Set(Object.values(bot.entities || {}).map(e => e.id))
    const info = { item: item.name, expectedEntity: expected.name, reference: position(target.position), face: position(face) }
    const spawned = new Map(), destination = target.position.plus(face).offset(0.5, 0, 0.5)
    let disconnected = false, interactionError = null, snapshotError = null, changes = null
    const onEnd = () => { disconnected = true }
    const onSpawn = entity => {
      if (!Number.isSafeInteger(entity.id) || existing.has(entity.id) || spawned.has(entity.id) || entity.name !== expected.name || !entity.position || ![entity.position.x, entity.position.y, entity.position.z].every(Number.isFinite)) return
      const radius = expected.boat ? 3 : expected.name === 'bat' ? 4 : 2
      if (entity.position.distanceTo(destination) >= radius || spawned.size >= 16) return
      // Entity positions mutate during physics; retain the actual spawn packet position.
      spawned.set(entity.id, { entityId: entity.id, ...(entity.uuid ? { entityUUID: entity.uuid } : {}), entity: entity.name, position: position(entity.position) })
    }
    bot.on('entitySpawn', onSpawn)
    bot.on('end', onEnd)
    try {
      try {
        signal?.throwIfAborted()
        // Boats use right-click-in-air with fluid raycasting. activateItem supplies
        // the current protocol's sequence/rotation; placeEntity omits these fields.
        if (expected.boat) bot.activateItem()
        else await bot._genericPlace(target, face, { swingArm: 'right', showHand: !item.name.endsWith('_spawn_egg'), forceLook: 'ignore', delta: target.intersect.minus(target.position) })
        await waitFor(() => spawned.size > 0 || disconnected, signal, 5000)
      } catch (error) { interactionError = error }
      try {
        if (disconnected) throw new Error('Connection ended; final inventory is unavailable')
        await syncInventory(bot)
        changes = inventoryChanges(before, counts(bot))
      } catch (error) { snapshotError = error }
      const observedEntities = [...spawned.values()], entity = observedEntities.length === 1 ? observedEntities[0] : null
      const evidence = [...(observedEntities.length ? ['server-entity-spawn'] : []), ...(!snapshotError ? ['server-inventory-snapshot'] : [])]
      const cancelled = signal?.aborted === true || interactionError?.name === 'AbortError'
      const errorCode = cancelled ? 'CANCELLED' : disconnected ? 'DISCONNECTED' : snapshotError ? 'INVENTORY_CONFIRMATION_UNAVAILABLE' : interactionError ? 'ENTITY_INTERACTION_FAILED' : observedEntities.length > 1 ? 'AMBIGUOUS_ENTITY_SPAWN' : !entity ? 'ENTITY_SPAWN_NOT_CONFIRMED' : bot.game.gameMode !== 'creative' && !changes.some(c => c.item === item.name && c.delta === -1) ? 'ITEM_CONSUMPTION_NOT_CONFIRMED' : null
      if (errorCode) {
        const reason = interactionError?.message || snapshotError?.message || ({
          AMBIGUOUS_ENTITY_SPAWN: 'Multiple matching new entities were observed; attribution is ambiguous',
          ENTITY_SPAWN_NOT_CONFIRMED: 'No matching new entity was observed within 5 seconds',
          ITEM_CONSUMPTION_NOT_CONFIRMED: 'Entity spawn observed, but survival item consumption was not confirmed'
        })[errorCode] || 'Entity spawn and inventory were not fully confirmed'
        const error = `${errorCode}: ${reason}; inspect before retrying`
        return { ok: false, cancelled, errorCode, error, target: { ...info, ...entity }, changes, observedEntities, evidence, output: `${error}; observedEntities: ${JSON.stringify(observedEntities)}; inventory changes: ${JSON.stringify(changes)}` }
      }
      return { ok: true, confirmed: true, target: { ...info, ...entity }, changes, evidence, output: `Placed ${entity.entity} at ${entity.position.x} ${entity.position.y} ${entity.position.z}; inventory changes: ${JSON.stringify(changes)}` }
    } finally {
      bot.removeListener('entitySpawn', onSpawn)
      bot.removeListener('end', onEnd)
      if (expected.boat) { try { bot.deactivateItem?.() } catch (_) {} }
    }
  })
}
