/**
 * placeentity — place a supported entity item (paintings are unsupported).
 * Requires the entity item in hand. Place against the block in sight.
 */
const { operation, aimedFace, position, counts, inventoryChanges, syncInventory } = require('../operation_result')
module.exports = {
  name: 'placeentity',
  description: 'Place supported entity item on aimed face respecting item rules; confirms spawn and consumption; paintings unsupported',
  usage: 'placeentity',
  handler: operation('placeentity', async (bot) => {
    await syncInventory(bot)
    const target = bot.blockAtCursor(4.5)
    if (!target) return { ok: false, error: 'No block in sight to place against' }
    const name = bot.heldItem?.name || ''
    if (!['armor_stand', 'end_crystal'].includes(name) && !name.endsWith('_boat') && !name.endsWith('_spawn_egg')) return { ok: false, error: 'Unsupported held entity item; paintings are not supported' }
    const face = aimedFace(target), before = counts(bot)
    const entity = await bot.placeEntity(target, face)
    if (!entity) return { ok: false, error: 'Entity placement was not confirmed' }
    await syncInventory(bot)
    const changes = inventoryChanges(before, counts(bot))
    if (bot.game.gameMode !== 'creative' && !changes.some(c => c.item === name && c.delta === -1)) return { ok: false, error: 'Entity spawned but consumption not confirmed', target: { entityId: entity.id }, changes, evidence: ['server-entity-spawn'] }
    return { ok: true, confirmed: true, target: { entityId: entity.id, entity: entity.name, position: position(entity.position), reference: position(target.position), face: position(face) }, changes, evidence: ['server-entity-spawn','server-inventory-snapshot'], output: `Placed ${entity.name} at ${entity.position.x} ${entity.position.y} ${entity.position.z}` }
  })
}
