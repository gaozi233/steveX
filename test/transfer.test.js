const test = require('node:test')
const assert = require('node:assert/strict')
const { handler } = require('../src/commands/actions/transfer')

function fixture(start) {
  const window = { inventoryStart: start, inventoryEnd: start + 36, slots: Array(start + 36).fill(null) }
  const calls = []
  const bot = { currentWindow: window, transfer: async options => calls.push(options),
    inventory: { items() { throw new Error('Must read the active window, not stale inventory') } } }
  return { bot, window, calls }
}

for (const start of [5, 27, 54]) {
  test(`transfer uses active window ranges including last hotbar slot (start=${start})`, async () => {
    const { bot, window, calls } = fixture(start)
    const nbt = { custom: 'kept' }
    window.slots[window.inventoryEnd - 1] = { name: 'stone', type: 1, metadata: 0, count: 3, nbt }
    window.slots[0] = { name: 'diamond', type: 2, count: 64 }
    assert.equal((await handler(bot, ['diamond'])).ok, false)
    assert.equal((await handler(bot, ['stone', '2'])).ok, true)
    assert.deepEqual(calls, [{ window, itemType: 1, metadata: 0, nbt, count: 2,
      sourceStart: start, sourceEnd: start + 36, destStart: 0, destEnd: start }])
  })
}

test('transfer defaults to one and prefers an exact item name', async () => {
  const { bot, window, calls } = fixture(27)
  window.slots[27] = { name: 'redstone', type: 2, count: 1 }
  window.slots[28] = { name: 'stone', type: 1, count: 1 }
  assert.equal((await handler(bot, ['stone'])).ok, true)
  assert.equal(calls[0].itemType, 1)
  assert.equal(calls[0].count, 1)
})

test('transfer rejects malformed counts, missing windows, invalid ranges and occupied cursors', async () => {
  const { bot, window, calls } = fixture(27)
  for (const count of ['2x', '1.5', '0', '-1', 'Infinity', '9007199254740992', '']) {
    assert.equal((await handler(bot, ['stone', count])).ok, false)
  }
  window.selectedItem = { name: 'dirt' }
  assert.match((await handler(bot, ['stone'])).error, /cursor/)
  window.selectedItem = null
  window.inventoryEnd = 1000
  assert.match((await handler(bot, ['stone'])).error, /range/)
  bot.currentWindow = null
  assert.match((await handler(bot, ['stone'])).error, /No container/)
  assert.equal(calls.length, 0)
})
