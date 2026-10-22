const test = require('node:test')
const assert = require('node:assert/strict')
const { craftTimeoutMs } = require('../src/commands/craft_timing')

test('craft watchdog scales within 30..93 seconds only for valid supported batch sizes', () => {
  assert.equal(craftTimeoutMs(['stick']), 30000)
  assert.equal(craftTimeoutMs(['stick', '1']), 30000)
  assert.equal(craftTimeoutMs(['stick', '64']), 93000)
  for (let i = 1; i <= 64; i++) assert.equal(craftTimeoutMs(['stick', String(i)]), 30000 + (i - 1) * 1000)
  for (const raw of ['0', '65', '-1', '2abc', 'Infinity', '9007199254740992']) assert.equal(craftTimeoutMs(['stick', raw]), 30000)
})
