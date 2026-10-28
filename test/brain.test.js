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
  let reply, entered, modelSignal
  const started = new Promise(resolve => { entered = resolve })
  brain.llm.chat = async (messages, { signal }) => {
    assert.equal(signal.aborted, false)
    modelSignal = signal
    entered()
    return new Promise(resolve => { reply = resolve })
  }
  const work = brain.tick()
  await started
  brain.stop()
  assert.equal(modelSignal.aborted, true)
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
  assert.equal(brain.start(), false)
  reply('say old-generation')
  await work
  assert.equal(brain.start(), true)
  brain.stop()
  assert.equal(commands.includes('say old-generation'), false)
})

test('pickCommand rejects prose and accepts a listed command', () => {
  const brain = new Brain(createAgent(), {}, { emit() {} })
  assert.equal(brain.pickCommand('I suggest gathering wood first.'), null)
  assert.equal(brain.pickCommand('```\npos\n```'), 'pos')
})

test('Brain context contains goal and history without executing automatic state queries', async () => {
  const commands = []
  const agent = createAgent()
  agent.executeCommand = async command => { commands.push(command); return { ok: true, output: 'unexpected snapshot' } }
  const brain = new Brain(agent, {}, { emit() {} }, { goal: 'inspect a chest' })
  brain.remember('say ready', 'Message sent')
  const context = await brain.gatherState()
  assert.deepEqual(commands, [])
  assert.match(context, /GOAL: inspect a chest/)
  assert.match(context, /say ready -> Message sent/)
  assert.doesNotMatch(context, /STATE:|unexpected snapshot/)
  assert.match(brain.buildSystem(), /No fresh state snapshot is supplied automatically/)
  const controller = new AbortController()
  controller.abort(new Error('cancelled context'))
  await assert.rejects(brain.gatherState(controller.signal), /cancelled context/)
})

test('Brain executes only model-selected queries and retains their results for the next turn', async () => {
  const commands = []
  const brain = activeBrain({ name: 'on-demand', executeCommand: async command => {
    commands.push(command)
    return { ok: true, output: 'Inventory: oak_log x2' }
  } })
  let calls = 0
  brain.llm.chat = async messages => {
    assert.deepEqual(commands, calls === 0 ? [] : ['inventory'])
    assert.doesNotMatch(messages[1].content, /STATE:/)
    if (calls++ === 0) return 'inventory'
    assert.match(messages[1].content, /inventory -> .*Inventory: oak_log x2/)
    return 'not a command'
  }
  await brain.tick()
  await brain.tick()
  assert.equal(calls, 2)
  assert.deepEqual(commands, ['inventory'])
  brain.stop()
})

test('Brain prompt supports recipe selection and verified goals without a hardcoded progression', async () => {
  const brain = new Brain(createAgent(), {}, { emit() {} }, { goal: 'craft one iron_ingot' })
  const system = brain.buildSystem()
  assert.doesNotMatch(system, /craft one iron_ingot/)
  assert.match(await brain.gatherState(), /GOAL: craft one iron_ingot/)
  assert.match(system, /recipeIndex/)
  assert.match(system, /verify inventory/i)
  assert.doesNotMatch(system, /Helpful chain|ironstone/)
})

test('Brain preserves complete command results and keeps the existing ten-entry limit', async () => {
  const brain = new Brain(createAgent(), {}, { emit() {} })
  const full = JSON.stringify({ recipes: Array.from({ length: 20 }, (_, index) => ({ index, item: 'wool' + index })) })
  brain.remember('recipes red_bed', full)
  assert.ok((await brain.gatherState()).includes(full))
  assert.equal(brain.history[0][1], full)
  const longInventory = 'inventory detail '.repeat(1000)
  brain.remember('inventory', longInventory)
  assert.ok((await brain.gatherState()).includes(longInventory))
  brain.remember('recipes white_bed', '{"recipes":["last white recipe"]}')
  const state = await brain.gatherState()
  assert.ok(state.includes('last white recipe'))
  assert.ok(state.includes(full))
  for (let i = 0; i < 10; i++) brain.remember('pos', 'record ' + i)
  assert.equal(brain.history.length, 10)
  assert.deepEqual(brain.history[0], ['pos', 'record 0'])
  assert.ok(!(await brain.gatherState()).includes(full))
  assert.equal(new Brain(createAgent(), {}, { emit() {} }).history.length, 0)
})

test('Brain preserves structured recipe query hints in failed command history', async () => {
  const brain = activeBrain({ name: 'query-hint', executeCommand: async command => command.startsWith('craft')
    ? { ok: false, error: 'long error '.repeat(50), nextQuery: 'recipes white_bed' }
    : { ok: true, output: 'state' } })
  brain.llm.chat = async () => 'craft white_bed'
  await brain.tick()
  assert.equal(JSON.parse(brain.history.at(-1)[1]).nextQuery,'recipes white_bed')
  brain.stop()
})

test('Brain preserves partial crafting output and confirmed deltas after a timeout', async () => {
  const brain = activeBrain({ name: 'partial-craft', executeCommand: async command => command.startsWith('craft')
    ? { ok: false, error: 'Action craft timed out', output: 'Craft incomplete; powered_rail net change 258; inspect before retrying',
      completedExecutions: 42, producedCount: 258, changes: [{ item: 'powered_rail', delta: 258 }] }
    : { ok: true, output: 'state' } })
  brain.llm.chat = async () => 'craft powered_rail 64 table'
  await brain.tick()
  const history = brain.history.at(-1)[1]
  assert.match(history, /timed out/)
  assert.match(history, /inspect before retrying/)
  assert.match(history, /"completedExecutions":42/)
  assert.match(history, /"producedCount":258/)
  assert.match(history, /"changes":\[\{"item":"powered_rail","delta":258\}\]/)
  brain.stop()
})
