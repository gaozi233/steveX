const test = require('node:test')
const assert = require('node:assert/strict')
const inventory = require('../src/commands/queries/inventory')

test('inventory keeps slots, separate stacks, components, removed defaults and legacy NBT', async () => {
  const items = [{ name: 'stone', count: 64, slot: 36 }, { name: 'stone', count: 3, slot: 38 },
    { name: 'diamond_pickaxe', count: 1, slot: 39, components: [{ type: 'damage', data: 123 }],
      removedComponents: ['custom_name'], nbt: { type: 'compound', value: { seed: { type: 'long', value: 123n } } } }]
  const bot = { inventory: { items: () => items } }
  const result = await inventory.handler(bot, [], { bot })
  assert.equal(result.inventorySlotSpace, 'player-inventory')
  assert.deepEqual(result.inventory.map(i => [i.slot, i.count]), [[36, 64], [38, 3], [39, 1]])
  assert.equal(result.inventory[2].components[0].data, 123)
  assert.equal(result.inventory[2].nbt.value.seed.value, '123')
  assert.deepEqual(result.inventory[2].removedComponents, ['custom_name'])
  assert.doesNotThrow(() => JSON.stringify(result))
})

test('nested book and container component data survives without reading any external container', async () => {
  const item = { name: 'shulker_box', count: 1, slot: 36, components: [{ type: 'container', data: [
    { itemId: 1, itemCount: 12, components: [{ type: 'writable_book_content', data: { pages: [{ raw: 'Page 1' }] } }] }
  ] }] }
  const bot = { inventory: { items: () => [item] } }
  const result = await inventory.handler(bot, [], { bot })
  assert.deepEqual(result.inventory[0].components, item.components)
})

test('empty inventory has a stable empty array', async () => {
  const bot = { inventory: { items: () => [] } }
  assert.deepEqual(await inventory.handler(bot, [], { bot }), {
    ok: true, output: 'Inventory is empty', inventory: [], inventorySlotSpace: 'player-inventory'
  })
})

test('empty slot count covers only player inventory and hotbar, not armor offhand or crafting', async () => {
  const slots = Array(46).fill(null)
  const bot = { inventory: { slots, inventoryStart: 9, inventoryEnd: 45, items: () => slots.slice(9,45).filter(Boolean) } }
  slots[5] = { name: 'helmet', count: 1 }; slots[45] = { name: 'shield', count: 1 }
  assert.equal((await inventory.handler(bot, [], { bot })).emptySlotCount, 36)
  slots[9] = { name: 'stone', count: 1 }; slots[44] = { name: 'stone', count: 64 }
  assert.equal((await inventory.handler(bot, [], { bot })).emptySlotCount, 34)
  bot.currentWindow = { slots: Array(63).fill(null), inventoryStart: 27, inventoryEnd: 63 }
  bot.currentWindow.slots[0] = { name: 'diamond', count: 64 }
  bot.currentWindow.slots[62] = { name: 'stone', count: 1 }
  assert.equal((await inventory.handler(bot, [], { bot })).emptySlotCount, 35)
  for(let i=27;i<63;i++) bot.currentWindow.slots[i] = { name: 'stone', count: 1 }
  const full = await inventory.handler(bot, [], { bot })
  assert.equal(full.emptySlotCount, 0)
  assert.match(full.output, /Empty slots: 0/)
})

test('nonempty armor and offhand are compact and separate even with an empty main inventory', async () => {
  const slots = Array(46).fill(null)
  const destinations = { head: 5, torso: 6, legs: 7, feet: 8, 'off-hand': 45 }
  for (const [name, slot] of Object.entries(destinations)) slots[slot] = { name, slot, count: 1, components: [{ type: 'damage', data: 0 }], nbt: null }
  const bot = { inventory: { slots, items: () => [] }, getEquipmentDestSlot: name => destinations[name] }
  const result = await inventory.handler(bot, [], { bot })
  assert.deepEqual(Object.keys(result.equipment), ['head', 'torso', 'legs', 'feet', 'offhand'])
  assert.equal(result.equipmentSlotSpace, 'player-inventory')
  assert.deepEqual(result.equipment.head, { name: 'head', count: 1, slot: 5 })
  assert.match(result.output, /Equipment:.*offhand=/)
  slots.fill(null)
  const empty = await inventory.handler(bot, [], { bot })
  assert.equal(Object.hasOwn(empty, 'equipment'), false)
  assert.equal(Object.hasOwn(empty, 'equipmentSlotSpace'), false)
  assert.equal(empty.output, 'Inventory is empty')
})

test('open containers never replace equipment slot space and damaged equipment retains details', async () => {
  const slots = Array(46).fill(null)
  slots[5] = { name: 'iron_helmet', count: 1, slot: 5, components: [{ type: 'damage', data: 12 }] }
  const bot = { inventory: { slots }, getEquipmentDestSlot: name => name === 'head' ? 5 : 45,
    currentWindow: { inventoryStart: 27, inventoryEnd: 63, slots: Array(63).fill(null) } }
  bot.currentWindow.slots[5] = { name: 'diamond', count: 64 }
  const result = await inventory.handler(bot, [], { bot })
  assert.equal(result.inventorySlotSpace, 'current-window')
  assert.equal(result.equipmentSlotSpace, 'player-inventory')
  assert.equal(result.equipment.head.name, 'iron_helmet')
  assert.equal(result.equipment.head.components[0].data, 12)
})

test('ordinary items and full durability omit all empty or zero-damage detail fields', async () => {
  const items = [{ name: 'stone', count: 64, slot: 36, type: 1, metadata: 0, nbt: null, components: [], removedComponents: [] },
    { name: 'diamond_pickaxe', count: 1, slot: 37, type: 2, metadata: 0,
      components: [{ type: 'damage', data: 0 }], removedComponents: [],
      nbt: { type: 'compound', value: { Damage: { type: 'int', value: 0 } } } }]
  const bot = { inventory: { items: () => items } }
  const result = await inventory.handler(bot, [], { bot })
  assert.deepEqual(result.inventory, [{ name: 'stone', count: 64, slot: 36 }, { name: 'diamond_pickaxe', count: 1, slot: 37 }])
  assert.equal(items[1].components.length, 1)
  assert.equal(items[1].nbt.value.Damage.value, 0)
})

test('legacy nonzero damage and other NBT remain present, without a synthetic zero-damage tag', async () => {
  const items = [{ name: 'pickaxe', count: 1, slot: 36, nbt: { type: 'compound', value: {
    Damage: { type: 'int', value: 8 }
  } } }, { name: 'custom', count: 1, slot: 37, nbt: { type: 'compound', value: {
    Damage: { type: 'int', value: 0 }, note: { type: 'string', value: 'keep' }
  } } }]
  const bot = { inventory: { items: () => items } }
  const result = await inventory.handler(bot, [], { bot })
  assert.equal(result.inventory[0].nbt.value.Damage.value, 8)
  assert.equal(Object.hasOwn(result.inventory[1].nbt.value, 'Damage'), false)
  assert.equal(result.inventory[1].nbt.value.note.value, 'keep')
})
