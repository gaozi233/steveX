const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const place = require('../src/commands/actions/place')
const { protectedApproach } = require('../src/commands/protected_approach')

for (const mode of ['reference', 'adjacent', 'prediction', 'no-consumption', 'unchanged']) {
  test(`placement confirmation: ${mode}`, async () => {
    const bot = { _client: new EventEmitter(), game: { gameMode: 'survival' }, registry: { blocksByName: { stone_slab: {} } }, heldItem: { name: 'stone_slab' }, _syncWindow: async () => {} }
    const pos = new Vec3(0,0,0), dest = new Vec3(0,1,0)
    const target = { position: pos, name: 'stone_slab', type: 1, stateId: 10, face: 1, intersect: new Vec3(0.4,0.5,0.6) }
    let reference = { ...target }, adjacent = { position: dest, name: 'stone_slab', type: 1, stateId: 10 }, count = 2
    bot.inventory = { items: () => [{ name: 'stone_slab', count }] }
    bot.blockAtCursor = () => target
    bot.blockAt = p => p.equals(pos) ? reference : adjacent
    const controller = new AbortController()
    bot._genericPlace = async () => {
      const point = mode === 'adjacent' ? dest : pos
      if (mode !== 'unchanged') {
        if (mode === 'adjacent') adjacent = { ...adjacent, stateId: 11 }
        else reference = { ...reference, stateId: 11 }
      }
      if (mode !== 'no-consumption') count--
      if (mode !== 'prediction') bot._client.emit('block_change', { location: point, type: mode === 'unchanged' ? 10 : 11 })
      if (mode === 'prediction' || mode === 'unchanged') controller.abort()
    }
    const r = await place.handler(bot, [], {}, { signal: controller.signal })
    assert.equal(r.ok, mode === 'reference' || mode === 'adjacent')
    if (r.ok) {
      assert.deepEqual(r.target.position, mode === 'adjacent' ? {x:0,y:1,z:0} : {x:0,y:0,z:0})
      assert.equal(r.changes.find(c => c.kind === 'block').afterStateId, 11)
    }
    assert.equal(bot._client.listenerCount('block_change'), 0)
    assert.equal(bot._client.listenerCount('multi_block_change'), 0)
  })
}

for (const mode of ['success', 'no-path', 'abort']) {
  test(`protected approach restores settings and abort listener: ${mode}`, async () => {
    const movements = { canDig: true, allow1by1towers: true, scafoldingBlocks: [4] }
    const original = { ...movements }, controller = new AbortController()
    let stopped = false
    const bot = { pathfinder: {
      setMovements: () => {}, setGoal: goal => { assert.equal(goal, null); stopped = true },
      goto: async () => {
        assert.equal(movements.canDig, false)
        assert.equal(movements.allow1by1towers, false)
        assert.deepEqual(movements.scafoldingBlocks, [])
        if (mode === 'abort') controller.abort()
        if (mode === 'no-path') throw Error('No path')
      }
    } }
    if (mode === 'success') await protectedApproach(bot, movements, {}, controller.signal)
    else await assert.rejects(protectedApproach(bot, movements, {}, controller.signal))
    assert.deepEqual(movements, original)
    assert.equal(stopped, true)
  })
}

test('empty-path resolution cannot leave a goal active while restoring digging', async () => {
  const movements = { canDig: true, allow1by1towers: true, scafoldingBlocks: [4] }
  let active = true
  const bot = { entity: { position: new Vec3(0,0,0) }, pathfinder: {
    goto: async () => {},
    setGoal: () => { assert.equal(movements.canDig, false); active = false },
    setMovements: () => { if (movements.canDig) assert.equal(active, false) }
  } }
  await assert.rejects(protectedApproach(bot, movements, { isEnd: () => false }), /No path reached/)
  assert.equal(movements.canDig, true)
})
