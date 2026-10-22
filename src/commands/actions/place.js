/**
 * place — place the held block
 */
const { operation, aimedFace, position, observeBlock, waitFor, counts, inventoryChanges, syncInventory } = require('../operation_result')
module.exports = {
  name: 'place',
  description: 'Place held block on aimed face (all six faces); confirms server block change and item consumption',
  usage: 'place',
  handler: operation('place', async (bot, args, agent, { signal } = {}) => {
    await syncInventory(bot)
    const target = bot.blockAtCursor(4.5)
    if (!target) return { ok: false, error: 'No block in sight to place against' }
    if (!bot.heldItem || !bot.registry.blocksByName[bot.heldItem.name]) return { ok: false, error: 'Hold a placeable block first' }
    const held = bot.heldItem.name, face = aimedFace(target), dest = target.position.plus(face), old = bot.blockAt(dest)
    if (!old) return { ok: false, error: 'Destination not loaded' }
    const before = counts(bot), observed = observeBlock(bot, dest)
    const info = { block: held, position: position(dest), reference: position(target.position), face: position(face) }
    try {
      await bot.placeBlock(target, face)
      const acknowledged = await waitFor(() => observed.stateId !== null && observed.stateId !== old.stateId, signal)
      await syncInventory(bot)
      const changes = inventoryChanges(before, counts(bot)), after = bot.blockAt(dest)
      if (!acknowledged || !after || after.type === old.type || (bot.game.gameMode !== 'creative' && !changes.some(c => c.item === held && c.delta === -1))) return { ok: false, error: 'Placement not fully confirmed; inspect before retrying', target: info, changes }
      changes.push({ kind: 'block', position: position(dest), before: old.name, after: after.name })
      return { ok: true, confirmed: true, target: info, changes, evidence: ['server-block-update','server-inventory-snapshot'], output: `Placed ${after.name} at ${dest.x} ${dest.y} ${dest.z}` }
    } finally { observed.close() }
  })
}
