const { sleep } = require('../agent/action_executor')
const { Vec3 } = require('vec3')
const operationNames = new Set(['dig', 'mine', 'collect', 'craft', 'place', 'placeentity'])
function result(action, value) {
  const completed = value.ok === true && value.confirmed === true
  return { ...value, ok: completed, action, status: completed ? 'completed' : value.cancelled ? 'cancelled' : 'failed', confirmed: completed,
    target: value.target ?? null, changes: value.changes ?? null, evidence: value.evidence || [],
    ...(!completed && !value.error ? { error: 'Operation not confirmed; inspect state before retrying' } : {}) }
}
function operation(action, handler) {
  return async (...args) => {
    try { return result(action, await handler(...args)) }
    catch (error) { return result(action, { ok: false, cancelled: error.name === 'AbortError' || args[3]?.signal?.aborted === true, error: error.message || String(error), output: 'Operation incomplete; inspect world and inventory before retrying' }) }
  }
}
const position = p => ({ x: p.x, y: p.y, z: p.z })
const faces = [new Vec3(0,-1,0), new Vec3(0,1,0), new Vec3(0,0,-1), new Vec3(0,0,1), new Vec3(-1,0,0), new Vec3(1,0,0)]
function aimedFace(block) {
  if (!Number.isInteger(block.face) || !faces[block.face]) throw new Error('Aimed block face unavailable')
  return faces[block.face].clone()
}
// Inbound packets only: blockUpdate also includes Mineflayer's local predictions.
function observeBlock(bot, point) {
  let stateId = null
  const single = p => { if (p.location.x === point.x && p.location.y === point.y && p.location.z === point.z) stateId = p.type }
  const multiple = p => {
    if (!p.chunkCoordinates) return
    for (const record of p.records) {
      const r = BigInt(record), c = p.chunkCoordinates
      if (c.x*16+Number((r>>8n)&15n)===point.x && c.y*16+Number(r&15n)===point.y && c.z*16+Number((r>>4n)&15n)===point.z) stateId = Number(r>>12n)
    }
  }
  bot._client.on('block_change', single); bot._client.on('multi_block_change', multiple)
  return { get stateId() { return stateId }, close() { bot._client.removeListener('block_change', single); bot._client.removeListener('multi_block_change', multiple) } }
}
async function waitFor(predicate, signal, timeoutMs = 2500) {
  const start = Date.now()
  while (true) {
    signal?.throwIfAborted()
    if (predicate()) return true
    if (Date.now()-start >= timeoutMs) return false
    await sleep(50, signal)
  }
}
async function digConfirmed(bot, block, signal) {
  const observed = observeBlock(bot, block.position)
  try {
    await bot.dig(block)
    const acknowledged = await waitFor(() => observed.stateId !== null && observed.stateId !== block.stateId, signal)
    const after = bot.blockAt(block.position), target = { block: block.name, position: position(block.position) }
    if (!acknowledged || !after || after.type === block.type) return { ok: false, error: 'No server-confirmed block removal; inspect before retrying', target }
    return { ok: true, confirmed: true, target, changes: [{ kind: 'block', position: position(block.position), before: block.name, after: after.name }], evidence: ['server-block-update'], output: `Removed ${block.name} at ${block.position.x} ${block.position.y} ${block.position.z}; drops not guaranteed collected` }
  } finally { observed.close() }
}
async function syncInventory(bot) {
  if (!bot._syncWindow) throw new Error('Server inventory synchronization unavailable')
  await bot._syncWindow(bot.currentWindow || bot.inventory)
}
function counts(bot) {
  const items = bot.currentWindow ? bot.currentWindow.slots.slice(bot.currentWindow.inventoryStart, bot.currentWindow.inventoryEnd).filter(Boolean) : bot.inventory.items()
  const totals = new Map()
  for (const item of items) totals.set(item.name, (totals.get(item.name)||0)+item.count)
  return totals
}
function inventoryChanges(before, after) {
  return [...new Set([...before.keys(),...after.keys()])].map(item => ({ kind: 'inventory', item, delta: (after.get(item)||0)-(before.get(item)||0) })).filter(c => c.delta!==0)
}
module.exports = { operationNames, result, operation, position, aimedFace, observeBlock, waitFor, digConfirmed, syncInventory, counts, inventoryChanges }
