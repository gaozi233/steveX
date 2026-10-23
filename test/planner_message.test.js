const test = require('node:test')
const assert = require('node:assert/strict')
const { Brain } = require('../src/agent/brain')
const { createApp } = require('../src/web/server/app')
const { EventEmitter } = require('node:events')
function fixture() {
  const calls = [], executed = []
  const agent = { name: 'a', sessionId: 'session-a', config: { llm: {} }, isOnline: () => true,
    bot: { version: '1.21.11' }, executeCommand: async command => { executed.push(command); return { ok: true, output: 'position' } } }
  const bus = new EventEmitter()
  const brain = new Brain(agent, { apiKey: 'fixture-only' }, bus, { allowedCommands: ['pos'], intervalMs: 100000 })
  brain.llm.chat = async messages => { calls.push(messages); return 'pos' }
  agent.brainLoop = brain
  return { agent, brain, calls, executed, bus }
}
test('system stays English and identical across tasks, histories and window changes', async () => {
  const f = fixture(), system = f.brain.buildSystem()
  assert.doesNotMatch(system, /[\u3400-\u9fff]/)
  assert.doesNotMatch(system, /GOAL:|WINDOW:|\[状态/)
  f.brain.goal = '把背包内容发送到聊天框'
  f.brain.remember('inventory', '背包观测')
  f.agent.bot.currentWindow = { type: 'minecraft:furnace' }
  assert.equal(f.brain.buildSystem(), system)
  const user = await f.brain.gatherState()
  assert.match(user, /GOAL: 把背包内容发送到聊天框/)
  assert.match(user, /WINDOW: minecraft:furnace/)
  assert.match(user, /COMMANDS:/)
  assert.match(user, /背包观测/)
})
test('one-step task changes goal, clears old history and performs exactly one command', async () => {
  const f = fixture(); f.brain.remember('old', 'old task')
  const result = await f.brain.submitTask('Query position')
  assert.equal(result.ok, true); assert.equal(result.command, 'pos')
  assert.equal(f.calls.length, 1); assert.deepEqual(f.executed, ['pos'])
  assert.match(f.calls[0][0].content, /You are SteveX.*1\.21\.11/)
  assert.doesNotMatch(f.calls[0][1].content, /old task/)
  assert.equal(f.brain.running, false); assert.equal(f.brain.inFlight, null)
})
test('concurrent tasks refuse without changing active goal; stopping rejects late command', async () => {
  const f = fixture(); let finish
  f.brain.llm.chat = () => new Promise(resolve => { finish = resolve })
  const task = f.brain.submitTask('first')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await f.brain.submitTask('second')).errorCode, 'BRAIN_BUSY')
  assert.equal(f.brain.goal, 'first'); f.brain.stop(); finish('pos')
  assert.equal((await task).ok, false); assert.deepEqual(f.executed, [])
})
test('task validation, missing key and offline never call provider', async () => {
  const f = fixture()
  assert.equal((await f.brain.submitTask(' ')).errorCode, 'INVALID_TASK')
  assert.equal((await f.brain.submitTask('task', 'unknown')).errorCode, 'INVALID_TASK')
  f.agent.isOnline = () => false
  assert.equal((await f.brain.submitTask('task')).errorCode, 'AGENT_OFFLINE')
  f.agent.isOnline = () => true; f.brain.llm.apiKey = ''
  assert.equal((await f.brain.submitTask('task')).errorCode, 'MISSING_API_KEY')
  assert.equal(f.calls.length, 0)
})
test('provider failures are redacted and command failures are not reported as successful tasks', async () => {
  const f = fixture()
  f.brain.llm.chat = async () => { throw Error('fixture-only provider error') }
  const failed = await f.brain.submitTask('query')
  assert.equal(failed.ok, false); assert.doesNotMatch(failed.error, /fixture-only/)
  assert.equal(f.brain.running, false)
  f.brain.llm.chat = async () => 'pos'
  f.agent.executeCommand = async () => ({ ok: false, error: 'unavailable' })
  assert.equal((await f.brain.submitTask('query')).ok, false)
})
test('continuous task requires explicit mode and stop cancels scheduling', async () => {
  const f = fixture()
  const result = await f.brain.submitTask('task', 'continuous')
  assert.equal(result.status, 'started'); assert.equal(f.brain.running, true)
  assert.equal(f.calls.length, 0); f.brain.stop(); assert.equal(f.brain.timer, null)
})
test('planner HTTP isolates agents, validates payload and returns actual one-step result', async t => {
  const f = fixture(), manager = { agents: new Map([['a', f.agent]]), agentConfigs: new Map(), config: {}, eventBus: f.bus }
  const server = createApp(manager).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => { require('../src/web/server/agent_debug').getDebugStore(manager).close(); server.closeAllConnections(); server.close() })
  const post = (name, body) => fetch(`http://127.0.0.1:${server.address().port}/api/agents/${name}/planner/message`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal((await post('missing', { message: 'task' })).status, 404)
  assert.equal((await post('a', { message: 'x'.repeat(4001) })).status, 400)
  const response = await post('a', { message: 'Query position', mode: 'once' })
  assert.equal(response.status, 200); assert.equal((await response.json()).command, 'pos')
  assert.equal(f.calls.length, 1)
})
