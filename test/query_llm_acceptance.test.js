const test = require('node:test')
const assert = require('node:assert/strict')
const { valid, cases } = require('../scripts/query-llm-acceptance')

test('query LLM acceptance blocks actions, extra arguments and multiline output', () => {
  assert.equal(cases.length, 13)
  for (const [name] of cases.filter(([name]) => !['nearby', 'findplayer', 'findblock'].includes(name))) {
    assert.ok(valid(name, name))
    assert.equal(valid(name + ' extra', name), false)
  }
  assert.ok(valid('nearby player 16', 'nearby'))
  assert.ok(valid('findplayer PIGGY985', 'findplayer'))
  assert.ok(valid('findblock minecraft:diamond_ore 8', 'findblock'))
  for (const value of ['findblock diamond_ore 8abc', 'findblock diamond_ore 129', 'goto 0 0 0', 'findblock diamond_ore 8\nstop', 'findblock diamond_ore 8;stop']) assert.equal(valid(value, 'findblock'), false)
})
