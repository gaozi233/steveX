const test = require('node:test')
const assert = require('node:assert/strict')
const { foodState } = require('../src/agent/food_state')
const hunger = require('../src/commands/queries/hunger')

test('food and saturation retain raw numeric values while text rounds only saturation', async () => {
  const bot = { food: 17, foodSaturation: 2.75 }
  assert.deepEqual(await hunger.handler(bot), { ok: true, output: 'Hunger: 17/20 | Saturation: 2.8 (last known)', food: 17, saturation: 2.75, saturationSource: 'last-update-health-packet' })
  assert.deepEqual(foodState({ food: 0, foodSaturation: 0 }), { food: 0, saturation: 0, saturationSource: 'last-update-health-packet' })
})

test('unknown and invalid food values are not presented as real readings', async () => {
  for (const value of [undefined, null, NaN, Infinity, '20']) {
    const result = await hunger.handler({ food: value, foodSaturation: value })
    assert.equal(result.food, null); assert.equal(result.saturation, null)
    assert.equal(result.saturationSource, null)
    assert.equal(result.output, 'Hunger: ?/20 | Saturation: ?')
  }
})

test('a last-known saturation reading is never guessed from food level', async () => {
  const bot = { food: 20, foodSaturation: 19 }
  assert.equal((await hunger.handler(bot)).saturation, 19)
  bot.food = 18
  assert.equal((await hunger.handler(bot)).saturation, 19)
  bot.foodSaturation = 0
  assert.equal((await hunger.handler(bot)).saturation, 0)
})
