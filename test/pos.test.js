const test = require('node:test')
const assert = require('node:assert/strict')
const { handler } = require('../src/commands/queries/pos')

test('pos rounds positive and negative coordinates to one decimal, including ties and zero', async () => {
  for (const [input, expected] of [[10.949, '10.9'], [10.95, '11.0'], [-10.95, '-11.0'],
    [1.25, '1.3'], [-1.25, '-1.3'], [-0.001, '0.0'], [-0.05, '-0.1'], [0, '0.0']]) {
    const bot = { entity: { position: { x: input, y: input, z: input } }, game: { dimension: 'overworld' } }
    assert.equal((await handler(bot)).output, `Position: ${expected} ${expected} ${expected} | Dimension: overworld`)
    assert.equal(bot.entity.position.x, input)
  }
})

test('pos retains the actual dimension in each world', async () => {
  for (const dimension of ['overworld', 'the_nether', 'the_end']) {
    const bot = { entity: { position: { x: 4.5, y: -60, z: -1.5 } }, game: { dimension } }
    assert.equal((await handler(bot)).output, `Position: 4.5 -60.0 -1.5 | Dimension: ${dimension}`)
  }
})
