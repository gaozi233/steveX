const test = require('node:test')
const assert = require('node:assert/strict')
const move = require('../src/commands/actions/move')
const jump = require('../src/commands/actions/jump')

function fixture(modern = true) {
  const packets = []
  return { packets, bot: { vehicle: {}, supportFeature: () => modern,
    _client: { write: (name, data) => packets.push({ name, data }) },
    getControlState: key => key === 'sneak' } }
}
test('vehicle directions release to neutral on both protocols without jump flags', async () => {
  for (const modern of [true, false]) for (const direction of ['forward', 'back', 'left', 'right']) {
    const { bot, packets } = fixture(modern)
    assert.equal((await move.handler(bot, [direction, '1'])).ok, true)
    assert.equal(packets.length, 2)
    const [start, end] = packets.map(p => p.data)
    if (modern) {
      assert.equal(start.inputs[direction === 'back' ? 'backward' : direction], true)
      assert.equal(end.inputs.shift, true)
      assert.equal(end.inputs.jump, false)
      for (const key of ['forward', 'backward', 'left', 'right']) assert.equal(end.inputs[key], false)
    } else {
      assert.equal(start.jump, 0)
      assert.deepEqual(end, { sideways: 0, forward: 0, jump: 0 })
    }
  }
})
test('vehicle cancellation releases inputs and invalid controls send nothing', async () => {
  const { bot, packets } = fixture()
  const controller = new AbortController()
  const pending = move.handler(bot, ['forward', '30000'], null, { signal: controller.signal })
  controller.abort()
  assert.equal((await pending).ok, false)
  assert.equal(packets.at(-1).data.inputs.forward, false)
  packets.length = 0
  for (const args of [['sprint'], ['left', '0'], ['diagonal']]) assert.equal((await move.handler(bot, args)).ok, false)
  assert.equal(packets.length, 0)
})
test('jump glide is explicit, validated, and only acknowledges a request', async () => {
  let calls = 0
  const bot = { elytraFly: async () => calls++ }
  const result = await jump.handler(bot, ['GLIDE'])
  assert.equal(calls, 1)
  assert.equal(result.confirmed, false)
  assert.equal(result.status, 'requested')
  assert.equal((await jump.handler(bot, ['invalid'])).ok, false)
  assert.equal((await jump.handler({ ...bot, vehicle: {} }, ['glide'])).ok, false)
  assert.equal(calls, 1)
  const controls = []
  assert.equal((await jump.handler({ setControlState: (...args) => controls.push(args) }, [])).ok, true)
  assert.deepEqual(controls, [['jump', true], ['jump', false]])
})
test('standalone vehicle commands are absent', () => {
  const { commands } = require('../src/commands').loadCommands()
  assert.equal(commands.drive, undefined)
  assert.equal(commands.elytra, undefined)
})
