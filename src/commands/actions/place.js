/**
 * place — place the held block
 */
const { operation, aimedFace, position, observeBlocks, waitFor, counts, inventoryChanges, syncInventory } = require('../operation_result')
const { Vec3 } = require('vec3')
const horizontal = { north: new Vec3(0,0,-1), south: new Vec3(0,0,1), west: new Vec3(-1,0,0), east: new Vec3(1,0,0) }
const properties = block => block?.getProperties?.() || {}
module.exports = {
  name: 'place',
  description: 'Place held block at the aimed hit point; confirms state and item consumption, both halves for doors/beds; returns actual positions and block properties',
  usage: 'place',
  handler: operation('place', async (bot, args, agent, { signal } = {}) => {
    await syncInventory(bot)
    const target = bot.blockAtCursor(4.5)
    if (!target) return { ok: false, errorCode: 'NO_TARGET', error: 'No block in sight to place against' }
    if (!bot.heldItem || !bot.registry.blocksByName[bot.heldItem.name]) return { ok: false, errorCode: 'UNSUPPORTED_ITEM', error: 'Hold a placeable block first' }
    const held = bot.heldItem.name, face = aimedFace(target), dest = target.position.plus(face)
    const candidates = [target.position, dest].map(point => ({ point, old: bot.blockAt(point) }))
    if (candidates.some(c => !c.old)) return { ok: false, errorCode: 'TARGET_NOT_LOADED', error: 'Destination not loaded' }
    const door = held.endsWith('_door'), bed = held.endsWith('_bed')
    const watched = new Map(candidates.map(c => [c.point.toString(), c]))
    for (const c of candidates) {
      const offsets = door ? [new Vec3(0,1,0)] : bed ? Object.values(horizontal) : []
      for (const offset of offsets) {
        const point = c.point.plus(offset)
        if (!watched.has(point.toString())) watched.set(point.toString(), { point, old: bot.blockAt(point) })
      }
    }
    const before = counts(bot)
    const observed = observeBlocks(bot, [...watched.values()].map(c => c.point))
    const info = { block: held, position: position(dest), reference: position(target.position), face: position(face) }
    try {
      signal?.throwIfAborted()
      // placeBlock rejects same-type updates and assumes an adjacent destination.
      // Preserve the ray hit: slabs and replaceable blocks can change in place.
      if (!target.intersect || !bot._genericPlace) return { ok: false, errorCode: 'INTERACTION_UNAVAILABLE', error: 'Precise placement interaction unavailable', target: info }
      await bot._genericPlace(target, face, { swingArm: 'right', delta: target.intersect.minus(target.position), forceLook: 'ignore' })
      const changed = c => c?.old && observed.stateId(c.point) !== null && observed.stateId(c.point) !== c.old.stateId && bot.blockAt(c.point)?.stateId === observed.stateId(c.point)
      const primary = () => {
        const changedCandidates = [...candidates].reverse().filter(changed)
        return changedCandidates.find(c => bot.blockAt(c.point)?.name === held) || changedCandidates[0]
      }
      const structure = first => {
        if (!first) return []
        if (!door && !bed) return [first]
        const block = bot.blockAt(first.point), p = properties(block)
        if (block?.name !== held || (door ? p.half !== 'lower' : p.part !== 'foot')) return []
        const offset = door ? new Vec3(0,1,0) : horizontal[p.facing]
        if (!offset) return []
        const other = watched.get(first.point.plus(offset).toString()), partner = other && bot.blockAt(other.point), q = properties(partner)
        if (!changed(other) || partner?.name !== held || p.facing !== q.facing) return []
        if (door ? q.half !== 'upper' || p.hinge !== q.hinge || p.open !== q.open : q.part !== 'head') return []
        return [first, other]
      }
      const acknowledged = await waitFor(() => structure(primary()).length > 0, signal)
      await syncInventory(bot)
      const first = primary(), confirmed = structure(first), changes = inventoryChanges(before, counts(bot))
      for (const c of confirmed.length ? confirmed : first ? [first] : []) {
        const after = bot.blockAt(c.point)
        changes.push({ kind: 'block', position: position(c.point), before: c.old.name, after: after.name, beforeStateId: c.old.stateId, afterStateId: after.stateId, properties: properties(after) })
      }
      const actual = first?.point || dest, actualTarget = { ...info, position: position(actual) }
      if (!acknowledged || !confirmed.length || (bot.game.gameMode !== 'creative' && !changes.some(c => c.item === held && c.delta === -1))) return { ok: false, errorCode: first && (door || bed) && !confirmed.length ? 'STRUCTURE_NOT_CONFIRMED' : 'PLACEMENT_NOT_CONFIRMED', error: 'Placement not fully confirmed; inspect blocks and inventory before retrying', target: actualTarget, changes, output: `Placement incomplete; observed changes: ${JSON.stringify(changes)}` }
      const after = bot.blockAt(actual)
      return { ok: true, confirmed: true, target: { ...actualTarget, properties: properties(after) }, changes, evidence: ['server-block-update','server-inventory-snapshot'], output: `Placed ${after.name} at ${actual.x} ${actual.y} ${actual.z}; blocks: ${JSON.stringify(changes.filter(c => c.kind === 'block'))}` }
    } finally { observed.close() }
  })
}
