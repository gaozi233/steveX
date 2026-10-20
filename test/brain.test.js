const test = require('node:test')
const assert = require('node:assert/strict')

const { Brain } = require('../src/agent/brain')

function createAgent() {
  return {
    name: 'test-agent',
    isOnline: () => false,
    executeCommand: async () => ({ ok: true, output: 'ok' })
  }
}

test('missing API key keeps the LLM client disabled', () => {
  const brain = new Brain(createAgent(), {}, { emit() {} })
  assert.equal(brain.llm.apiKey, '')
})

test('stop clears the pending loop timer', () => {
  const brain = new Brain(createAgent(), {}, { emit() {} })
  brain.start()

  assert.equal(brain.running, true)
  assert.ok(brain.timer)

  brain.stop()

  assert.equal(brain.running, false)
  assert.equal(brain.timer, null)
})

test('pickCommand rejects prose and accepts a listed command', () => {
  const brain = new Brain(createAgent(), {}, { emit() {} })
  assert.equal(brain.pickCommand('I suggest gathering wood first.'), null)
  assert.equal(brain.pickCommand('```\npos\n```'), 'pos')
})
