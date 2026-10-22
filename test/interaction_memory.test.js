const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { EventEmitter } = require('node:events')
const { InteractionMemory, playerState } = require('../src/agent/interaction_memory')

test('open-window inventory wins over the stale player inventory cache', async () => {
  const bot = botFixture('body')
  const agent = { name: 'a', bot, isOnline: () => true }
  bot.currentWindow = { inventoryStart: 2, inventoryEnd: 4, slots: [
    { name: 'diamond', count: 64, slot: 0 }, null,
    { name: 'iron_ingot', count: 1, slot: 2 }, null
  ] }
  const state = playerState(agent)
  assert.equal(state.inventorySlotSpace, 'current-window')
  assert.deepEqual(state.inventory.map(item => item.name), ['iron_ingot'])
  const result = await require('../src/commands/queries/inventory').handler(bot, [], agent)
  assert.equal(result.output, 'Inventory: iron_ingot x1 | Empty slots: 1')
  assert.equal(result.emptySlotCount, 1)
  assert.equal(state.emptySlotCount, 1)
  bot.currentWindow = null
  assert.equal(playerState(agent).inventorySlotSpace, 'player-inventory')
  assert.equal(playerState(agent).inventory[0].name, 'apple')
})

function botFixture(uuid) {
  const bot = Object.assign(new EventEmitter(), { game: { dimension: 'overworld', gameMode: 'survival' },
    entity: { uuid, position: { x: 1, y: 64, z: 0 } }, health: 18,
    inventory: { items: () => [{ name: 'apple', count: 2 }] } })
  bot.openBlock = async () => {
    const window = Object.assign(new EventEmitter(), { id: 1, type: 'minecraft:generic_9x3', inventoryStart: 27,
      slots: Array(63).fill(null) })
    window.slots[0] = { name: 'potion', count: 1, components: [{ type: 'potion_contents', data: { opaque: 123n } }] }
    window.slots[27] = { name: 'diamond', count: 64 }
    bot.emit('windowOpen', window)
    return window
  }
  return bot
}

test('state explicitly reads nonenumerable control getters and local collision cells', () => {
  const { Vec3 } = require('vec3')
  const bot = botFixture('body')
  bot.entity.position = new Vec3(2.5, 64, 4.5)
  bot.controlState = {}
  Object.defineProperty(bot.controlState, 'forward', { get: () => true })
  bot.getControlState = key => key === 'forward'
  bot.blockAt = p => ({ name: p.y < 64 ? 'stone' : 'air', boundingBox: p.y < 64 ? 'block' : 'empty', shapes: [] })
  const state = playerState({ bot, isOnline: () => true })
  assert.equal(state.controls.forward, true)
  assert.equal(Object.keys(state.controls).length, 7)
  assert.equal(state.controls.jump, false)
  assert.equal(state.localTerrain.length, 9)
  assert.equal(state.localTerrain[4].below.name, 'stone')
  assert.equal(state.localTerrain[4].overhead.name, 'air')
})

test('Mineflayer windows preserve components and known empty slots, exclude player inventory and isolate actors', async t => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stevex-interaction-'))
  t.after(() => fs.rm(outputDir, { recursive: true, force: true }))
  const memories = []
  for (const agentId of ['alpha', 'beta']) {
    const bot = botFixture(agentId)
    const original = bot.openBlock
    const memory = new InteractionMemory({ agentName: agentId, agentId, memoryNamespace: 'world',
      sessionId: 'test-session', server: { host: 'localhost', port: 25565 }, outputDir })
    memory.attach(bot)
    const window = await bot.openBlock({ name: 'chest', position: { x: agentId === 'alpha' ? 0 : 256, y: 64, z: 0 } })
    assert.equal(memory.snapshot().records[0].slots.length, 27)
    assert.equal(memory.snapshot().records[0].slots[0].components[0].data.opaque, '123')
    assert.equal(memory.snapshot().records[0].slots[1], null)
    window.slots[0] = null
    window.emit('updateSlot', 0)
    bot.emit('windowClose', window)
    await memory.close()
    assert.equal(bot.openBlock, original)
    assert.equal(bot.listenerCount('windowOpen'), 0)
    assert.equal(window.listenerCount('updateSlot'), 0)
    const disk = JSON.parse(await fs.readFile(memory.file))
    assert.equal(disk.records[0].actorUuid, agentId)
    assert.ok(disk.records[0].slots.every(slot => slot === null))
    assert.equal(disk.records[0].source, 'mineflayer-window')
    memories.push(memory)
  }
  assert.notEqual(memories[0].file, memories[1].file)
  assert.notEqual(memories[0].snapshot().records[0].target.pos[0], memories[1].snapshot().records[0].target.pos[0])
})

test('uncorrelated windows never invent a container position and state uses the Mineflayer body', async t => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stevex-unknown-window-'))
  t.after(() => fs.rm(outputDir, { recursive: true, force: true }))
  const bot = botFixture('body-not-renderer')
  const memory = new InteractionMemory({ agentId: 'a', memoryNamespace: 'world', sessionId: 'session', outputDir })
  memory.attach(bot)
  bot.emit('windowOpen', Object.assign(new EventEmitter(), { id: 2, inventoryStart: 1, slots: [null] }))
  assert.equal(memory.snapshot().records[0].scope, 'unknown')
  assert.equal(memory.snapshot().records[0].target, undefined)
  const state = playerState({ name: 'a', bot, sessionId: 'session', isOnline: () => true })
  assert.equal(state.uuid, 'body-not-renderer')
  assert.equal(state.inventory[0].name, 'apple')
  assert.equal(state.source, 'mineflayer-protocol')
  assert.throws(() => playerState({ isOnline: () => false }), /offline/)
  await memory.close()
})
