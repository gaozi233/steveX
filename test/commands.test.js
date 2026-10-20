const test = require('node:test')
const assert = require('node:assert/strict')

const attack = require('../src/commands/actions/attack')
const eat = require('../src/commands/actions/eat')
const fish = require('../src/commands/actions/fish')
const anvil = require('../src/commands/actions/anvil')
const furnace = require('../src/commands/actions/furnace')
const enchant = require('../src/commands/actions/enchant')
const dispenser = require('../src/commands/actions/dispenser')
const moveslot = require('../src/commands/actions/moveslot')
const putaway = require('../src/commands/actions/putaway')
const stop = require('../src/commands/actions/stop')
const gamemode = require('../src/commands/queries/gamemode')
const oxygen = require('../src/commands/queries/oxygen')

test('attack and eat handlers use the bot command argument', async () => {
  const entity = { name: 'zombie' }
  let attacked = null
  const attackResult = await attack.handler({
    nearestEntity: () => entity,
    attack: async target => { attacked = target }
  }, [])

  assert.equal(attackResult.ok, true)
  assert.equal(attacked, entity)

  let consumed = false
  const eatResult = await eat.handler({
    heldItem: { name: 'bread' },
    consume: async () => { consumed = true }
  }, [])

  assert.equal(eatResult.ok, true)
  assert.equal(consumed, true)
  assert.match(eatResult.output, /bread/)
})

test('gamemode supports modern string values and legacy numeric values', async () => {
  assert.equal((await gamemode.handler({ game: { gameMode: 'survival' } })).output, 'Game mode: survival')
  assert.equal((await gamemode.handler({ game: { gameMode: 1 } })).output, 'Game mode: creative')
})

test('oxygen normalizes the 1.21.11 metadata scale', async () => {
  const result = await oxygen.handler({ version: '1.21.11', oxygenLevel: 400 })
  assert.equal(result.output, 'Oxygen: 20/20')
})

test('commands reject missing prerequisites without calling Mineflayer', async () => {
  assert.equal((await fish.handler({ heldItem: null })).error, 'Hold a fishing rod before fishing')

  const grassBot = { blockAtCursor: () => ({ name: 'grass_block' }) }
  assert.match((await anvil.handler(grassBot)).error, /not an anvil/)
  assert.match((await furnace.handler(grassBot)).error, /not a furnace/)
  assert.match((await enchant.handler(grassBot)).error, /not an enchanting table/)
  assert.match((await dispenser.handler(grassBot)).error, /not a dispenser or dropper/)

  const emptyInventoryBot = { inventory: { slots: [] } }
  assert.equal((await moveslot.handler(emptyInventoryBot, ['9', '10'])).error, 'Source slot 9 is empty')
  assert.equal((await putaway.handler(emptyInventoryBot, ['9'])).error, 'Slot 9 is empty')
})

test('stop clears an active follow loop', async () => {
  let stopped = false
  const bot = {
    _followInterval: setInterval(() => {}, 1000),
    pathfinder: { stop: () => { stopped = true } }
  }

  const result = await stop.handler(bot)

  assert.equal(result.ok, true)
  assert.equal(bot._followInterval, null)
  assert.equal(stopped, true)
})
