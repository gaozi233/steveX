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
  assert.equal(brain.start(), false)
  assert.equal(brain.timer, null)
})

test('stop clears the pending loop timer', () => {
  const brain = new Brain(createAgent(), { apiKey: 'test-only' }, { emit() {} })
  brain.start()

  assert.equal(brain.running, true)
  assert.ok(brain.timer)

  brain.stop()

  assert.equal(brain.running, false)
  assert.equal(brain.timer, null)
})

function activeBrain(agent = createAgent()) {
  agent.isOnline = () => true
  const brain = new Brain(agent, { apiKey: 'test-only' }, { emit() {} })
  brain.running = true
  return brain
}

test('stop during LLM request prevents a late command even if the provider ignores abort', async () => {
  const commands = []
  const brain = activeBrain({ name: 'late', executeCommand: async cmd => { commands.push(cmd); return { ok: true, output: 'ok' } } })
  let reply, entered
  const started = new Promise(resolve => { entered = resolve })
  brain.llm.chat = async (messages, { signal }) => {
    assert.equal(signal, brain.controller.signal)
    entered()
    return new Promise(resolve => { reply = resolve })
  }
  const work = brain.tick()
  await started
  brain.stop()
  reply('say stale')
  await work
  assert.equal(commands.includes('say stale'), false)
  assert.equal(brain.controller.signal.aborted, true)
})

test('invalid replies remain bounded and creative/multiple commands are rejected', async () => {
  const brain = activeBrain()
  brain.llm.chat = async () => 'not a command'
  for (let i = 0; i < 25; i++) await brain.tick()
  assert.equal(brain.history.length, 10)
  assert.equal(brain.pickCommand('pos\nhp'), null)
  assert.equal(brain.pickCommand('setinventory 36 diamond 64'), null)
  brain.stop()
})

test('a stopped generation cannot execute after restart', async () => {
  const commands = []
  const brain = activeBrain({ name: 'restart', executeCommand: async cmd => { commands.push(cmd); return { ok: true, output: 'ok' } } })
  let reply, entered
  const started = new Promise(resolve => { entered = resolve })
  brain.llm.chat = async () => { entered(); return new Promise(resolve => { reply = resolve }) }
  const work = brain.tick()
  await started
  brain.stop()
  assert.equal(brain.start(), true)
  reply('say old-generation')
  await work
  brain.stop()
  assert.equal(commands.includes('say old-generation'), false)
})

test('pickCommand rejects prose and accepts a listed command', () => {
  const brain = new Brain(createAgent(), {}, { emit() {} })
  assert.equal(brain.pickCommand('I suggest gathering wood first.'), null)
  assert.equal(brain.pickCommand('```\npos\n```'), 'pos')
})
