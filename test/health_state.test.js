const test = require('node:test')
const assert = require('node:assert/strict')
const { healthState } = require('../src/agent/health_state')
const hp = require('../src/commands/queries/hp')

test('health includes maximum attribute modifiers rather than a hardcoded twenty', async () => {
  const bot = { health: 23.5, entity: { attributes: { 'minecraft:max_health': { value: 20,
    modifiers: [{ operation: 0, amount: 8 }] } } } }
  assert.deepEqual(healthState(bot), { health: 23.5, maxHealth: 28 })
  assert.deepEqual(await hp.handler(bot), { ok: true, output: 'HP: 23.5/28', health: 23.5, maxHealth: 28 })
  bot.entity.attributes['minecraft:max_health'].modifiers = []
  bot.entity.attributes['minecraft:max_health'].value = 40
  assert.equal(healthState(bot).maxHealth, 40)
})

test('legacy names, modifier order and unknown values are handled explicitly', () => {
  const bot = { health: 10, entity: { attributes: { 'generic.maxHealth': { value: 20, modifiers: [
    { operation: 2, amount: 0.5 }, { operation: 1, amount: 0.25 }, { operation: 0, amount: 4 }
  ] } } } }
  assert.equal(healthState(bot).maxHealth, 45)
  assert.deepEqual(healthState({}), { health: null, maxHealth: null })
  assert.deepEqual(healthState({ health: NaN, maxHealth: Infinity }), { health: null, maxHealth: null })
  assert.equal(healthState({ maxHealth: 30 }).maxHealth, 30)
})

test('health maximum obeys the registry attribute bounds after modifiers', () => {
  const bot = { registry: { attributesArray: [{ name: 'maxHealth', resource: 'minecraft:max_health', min: 1, max: 1024 }] },
    entity: { attributes: { 'minecraft:max_health': { value: 5000, modifiers: [] } } } }
  assert.equal(healthState(bot).maxHealth, 1024)
  bot.entity.attributes['minecraft:max_health'].value = 0
  assert.equal(healthState(bot).maxHealth, 1)
})

function absorptionBot(amount) {
  return { health: 20, maxHealth: 20,
    registry: { entitiesByName: { player: { metadataKeys: ['air_supply', 'player_absorption'] } } },
    entity: { metadata: { 0: 300, 1: amount } } }
}

test('positive absorption adds a separate field and text without changing normal health', async () => {
  const bot = absorptionBot(5.5)
  assert.deepEqual(await hp.handler(bot), {
    ok: true, output: 'HP: 20.0/20 | Absorption: 5.5', health: 20, maxHealth: 20, absorption: 5.5
  })
  bot.entity.metadata[1] = 0.01
  assert.equal((await hp.handler(bot)).output, 'HP: 20.0/20 | Absorption: 0.01')
  bot.entity.metadata[1] = 0
  assert.deepEqual(await hp.handler(bot), { ok: true, output: 'HP: 20.0/20', health: 20, maxHealth: 20 })
})

test('zero, unknown and invalid absorption are completely omitted', async () => {
  for (const amount of [0, -0, -1, undefined, null, NaN, Infinity, -Infinity, '4']) {
    const result = await hp.handler(absorptionBot(amount))
    assert.equal(Object.hasOwn(result, 'absorption'), false)
    assert.equal(result.output, 'HP: 20.0/20')
  }
  const bot = absorptionBot(8)
  bot.registry.entitiesByName.player.metadataKeys = ['air_supply']
  assert.equal(Object.hasOwn(await hp.handler(bot), 'absorption'), false)
  delete bot.registry
  assert.equal(Object.hasOwn(await hp.handler(bot), 'absorption'), false)
})
