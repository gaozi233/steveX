const { sleep } = require('../agent/action_executor')
const { Vec3 } = require('vec3')
const { withContract, exceptionFailure } = require('./command_contract')
const operationNames = new Set(['dig', 'collect', 'craft', 'rightclick'])
function result(action, value) {
  const completed = value.ok === true && value.confirmed === true
  return { ...value, ok: completed, action, status: completed ? 'completed' : value.cancelled ? 'cancelled' : 'failed', confirmed: completed,
    target: value.target ?? null, changes: value.changes ?? null, evidence: value.evidence || [],
    ...(!completed && !value.error ? { error: 'Operation not confirmed; inspect state before retrying' } : {}) }
}
function operation(action, handler) {
  return withContract(action, async (...args) => {
    try { return result(action, await handler(...args)) }
    catch (error) { return result(action, { ...exceptionFailure(action,error,args[3]?.signal), output: 'Operation incomplete; inspect world and inventory before retrying' }) }
  })
}
const position = p => ({ x: p.x, y: p.y, z: p.z })
const faces = [new Vec3(0,-1,0), new Vec3(0,1,0), new Vec3(0,0,-1), new Vec3(0,0,1), new Vec3(-1,0,0), new Vec3(1,0,0)]
function aimedFace(block) {
  if (!Number.isInteger(block.face) || !faces[block.face]) throw new Error('Aimed block face unavailable')
  return faces[block.face].clone()
}
// Inbound packets only: blockUpdate also includes Mineflayer's local predictions.
function observeBlocks(bot, points) {
  const key = p => `${p.x},${p.y},${p.z}`
  const states = new Map(points.map(p => [key(p), null]))
  const update = (point, stateId) => { if (states.has(key(point))) states.set(key(point), stateId) }
  const single = p => update(p.location, p.type)
  const multiple = p => {
    if (!p.chunkCoordinates) return
    for (const record of p.records) {
      const r = BigInt(record), c = p.chunkCoordinates
      update({ x: c.x*16+Number((r>>8n)&15n), y: c.y*16+Number(r&15n), z: c.z*16+Number((r>>4n)&15n) }, Number(r>>12n))
    }
  }
  bot._client.on('block_change', single); bot._client.on('multi_block_change', multiple)
  return { stateId: point => states.get(key(point)) ?? null, close() { bot._client.removeListener('block_change', single); bot._client.removeListener('multi_block_change', multiple) } }
}
function observeBlock(bot, point) {
  const observed = observeBlocks(bot, [point])
  return { get stateId() { return observed.stateId(point) }, close: observed.close }
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
    if (!acknowledged || !after || after.type === block.type) {
      const unchanged = observed.stateId === block.stateId
      let clientStateRestored = false
      // A rejection can arrive before Mineflayer's later local air prediction.
      // Replay only an actually observed unchanged server state, never our old guess.
      if (unchanged && after && after.stateId !== observed.stateId && typeof bot._updateBlockState === 'function') {
        try {
          await bot._updateBlockState(block.position, observed.stateId)
          clientStateRestored = bot.blockAt(block.position)?.stateId === observed.stateId
        } catch { /* Cache repair must not hide the original unconfirmed operation. */ }
      }
      return { ok:false,errorCode:'DIG_NOT_CONFIRMED',target,
        error:unchanged?'Server reported the target unchanged; check protection/permissions and state before retrying':'No server-confirmed block removal; inspect before retrying',
        ...(unchanged?{serverObservation:{block:block.name,stateId:observed.stateId,source:'server-block-update',unchanged:true},
          clientStateRestored,evidence:['server-block-update-unchanged']}: {}) }
    }
    return { ok: true, confirmed: true, target, changes: [{ kind: 'block', position: position(block.position), before: block.name, after: after.name }], evidence: ['server-block-update'], output: `Removed ${block.name} at ${block.position.x} ${block.position.y} ${block.position.z}; drops not guaranteed collected` }
  } finally { observed.close() }
}
async function syncInventory(bot,options) {
  await require('./inventory_sync').syncWindow(bot,bot.currentWindow||bot.inventory,options)
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
module.exports = { operationNames, result, operation, position, aimedFace, observeBlock, observeBlocks, waitFor, digConfirmed, syncInventory, counts, inventoryChanges }
