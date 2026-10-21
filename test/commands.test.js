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

test('oxygen reports the normalized body reading without guessing another scale', async () => {
  const result = await oxygen.handler({ version: '1.21.11', oxygenLevel: 20 })
  assert.equal(result.output, 'Oxygen: 20/20')
  assert.equal((await oxygen.handler({ oxygenLevel: null })).oxygen, null)
})

test('basic actions reject nonfinite angles/coordinates and partial duration strings', async () => {
  const bot = { look() { throw Error('must not run') }, lookAt() { throw Error('must not run') }, setControlState() { throw Error('must not run') } }
  const look = require('../src/commands/actions/look')
  const lookat = require('../src/commands/actions/lookat')
  const move = require('../src/commands/actions/move')
  for (const args of [['Infinity', '0'], ['0', '2'], ['NaN', '0']]) assert.equal((await look.handler(bot, args)).ok, false)
  assert.equal((await lookat.handler(bot, ['0', 'Infinity', '0'])).ok, false)
  for (const duration of ['100abc', '1.5', '0', '-1', '30001']) assert.equal((await move.handler(bot, ['forward', duration])).ok, false)
})

test('nearby applies a radius, sorts nearest first, and matches player usernames', async () => {
  const { Vec3 } = require('vec3')
  const nearby = require('../src/commands/queries/nearby')
  const body = { position: new Vec3(0, 64, 0) }
  const agent = { bot: { entity: body, entities: {
    0: body, 1: { name: 'turtle', type: 'animal', position: new Vec3(80, 64, 0) },
    2: { name: 'player', username: 'Observer', type: 'player', position: new Vec3(5, 64, 0) },
    3: { name: 'chicken', type: 'animal', position: new Vec3(2, 64, 0) }
  } } }
  const result = await nearby.handler(agent.bot, [], agent)
  assert.deepEqual(result.entities.map(e => e.name), ['chicken', 'Observer'])
  assert.equal((await nearby.handler(agent.bot, ['observer', '10'], agent)).entities.length, 1)
  assert.equal((await nearby.handler(agent.bot, ['all', '100abc'], agent)).ok, false)
  assert.equal((await nearby.handler(agent.bot, ['all', '1'], agent)).entities.length, 0)
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
