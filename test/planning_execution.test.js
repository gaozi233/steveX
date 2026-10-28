const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { SteveXAgent } = require('../src/agent/agent')
const { Brain } = require('../src/agent/brain')
const { CommandRuntime } = require('../src/agent/command_runtime')
const { CommandPlanner } = require('../src/agent/command_planner')
const { getDebugStore } = require('../src/web/server/agent_debug')

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function fixture(t) {
  const bus = new EventEmitter(), entered = deferred(), release = deferred()
  const agent = new SteveXAgent({}, 'fixture', {
    wait: async () => { entered.resolve(); await release.promise; return { ok: true, output: 'settled' } },
    pos: async () => ({ ok: true, output: 'position' }),
  }, { queryNames: new Set(['pos']), eventBus: bus })
  agent.bot = { version: '1.21.11' }; agent.connected = true
  const brain = new Brain(agent, { apiKey: 'fixture-only' }, bus, { allowedCommands: ['pos', 'wait'] })
  agent.brainLoop = brain
  brain.llm.chat = async () => 'pos'
  t.after(() => { release.resolve(); brain.stop(); agent.commandRuntime.close(); agent.executor.close() })
  return { agent, brain, bus, entered, release }
}

test('planning alone never executes and proposals cannot be mutated or submitted twice', async t => {
  const { agent, brain } = fixture(t)
  const request = await brain.requestDecision()
  assert.equal(agent.commandRuntime.records.size, 0)
  const decision = await request.result
  assert.equal(Object.isFrozen(decision), true)
  assert.equal(request.snapshot().status, 'proposed')
  assert.equal(agent.commandRuntime.records.size, 0)
  const command = brain.submitDecision(decision)
  assert.equal((await command.result).ok, true)
  assert.equal(command.snapshot().llmRequestId, request.requestId)
  assert.equal(command.snapshot().contextId, decision.contextId)
  assert.throws(() => brain.submitDecision(decision), /already submitted/)
  assert.throws(() => brain.submitDecision({ ...decision }), /Unknown/)
})

test('an executing action does not block independent planning and read-only observation', async t => {
  const f = fixture(t)
  const action = f.agent.submitCommand('wait 1', { source: 'brain', nodeId: 'node-a' })
  await f.entered.promise
  assert.equal(action.snapshot().status, 'running')
  const request = await f.brain.requestDecision({ trigger: 'execution_progress' })
  const decision = await request.result
  const observation = f.brain.submitDecision(decision)
  assert.equal((await observation.result).output, 'position')
  assert.equal(action.snapshot().status, 'running')
  assert.equal(f.agent.currentAction, 'wait')
  f.release.resolve(); await action.result
  assert.equal(action.snapshot().status, 'returned')
})

test('cancelling an uncooperative action retains ownership until settlement and does not cancel queries', async t => {
  const f = fixture(t)
  const action = f.agent.submitCommand('wait 1', { source: 'brain' })
  await f.entered.promise
  let nextRan = false
  f.agent.commands.later = async () => { nextRan = true; return { ok: true } }
  const next = f.agent.submitCommand('later', { source: 'brain' })
  assert.equal(f.agent.cancelCommand(action.callId), true)
  assert.equal(action.snapshot().status, 'cancelling')
  assert.equal(nextRan, false)
  assert.equal((await f.agent.submitCommand('pos', { source: 'brain' }).result).ok, true)
  assert.equal(f.agent.executor.getStatus().pending, 2)
  f.release.resolve()
  assert.equal((await action.result).cancelled, true)
  assert.equal((await next.result).ok, true)
  assert.equal(action.snapshot().status, 'cancelled')
})

test('proposals are rejected after task revision, cancellation or window catalog changes', async t => {
  const f = fixture(t)
  const { createTask } = require('../src/agent/task_session')
  f.brain.task = createTask('inspect', { maxCalls: 5, maxDurationMs: 10000 })
  let decision = await (await f.brain.requestDecision()).result
  f.brain.task.revision++
  assert.throws(() => f.brain.submitDecision(decision), /stale/)
  decision = await (await f.brain.requestDecision()).result
  f.brain.availableCommands = []
  assert.throws(() => f.brain.submitDecision(decision), /not currently available/)
  f.brain.stop()
  assert.throws(() => f.brain.submitDecision(decision), /stale/)
  assert.equal(f.agent.commandRuntime.records.size, 0)
})

test('decision cancellation does not release a provider request that ignores abort', async () => {
  const entered = deferred(), release = deferred(), events = new EventEmitter()
  const planner = new CommandPlanner({ apiKey: 'fixture', model: 'fake', chat: async () => {
    entered.resolve(); return release.promise
  } }, events, { name: 'a' }, () => 'pos')
  const messages = [{ role: 'user', content: 'original' }]
  let input
  events.on('agent:llm:input', value => { input = value.messages })
  const request = planner.request(messages)
  messages[0].content = 'mutated'
  await entered.promise
  assert.equal(input[0].content, 'original')
  request.cancel()
  assert.equal(request.snapshot().status, 'cancelling')
  assert.throws(() => planner.request(messages), /still settling/)
  release.resolve('pos')
  await assert.rejects(request.result, /cancelled/)
  assert.equal(planner.pending, null)
  assert.equal(request.snapshot().status, 'cancelled')
})

test('command records are bounded, isolated and do not retain large results', async () => {
  const first = new CommandRuntime(async () => ({ ok: true, output: 'x'.repeat(50000) }), { historyLimit: 2 })
  const second = new CommandRuntime(async () => ({ ok: true }))
  const old = first.submit('pos')
  assert.equal((await old.result).output.length, 50000)
  await first.submit('pos').result
  await first.submit('pos').result
  assert.equal(first.records.size, 2)
  assert.equal(old.snapshot(), null)
  assert.equal(second.get(old.callId), null)
  assert.equal([...first.records.values()].some(item => item.result), false)
})

test('closing runtime cancels queued submissions before their handlers execute', async t => {
  const f = fixture(t)
  const action = f.agent.submitCommand('wait 1', { source: 'brain' })
  f.agent.commandRuntime.close()
  assert.equal((await action.result).cancelled, true)
  assert.equal(action.snapshot().startedAt, null)
  assert.throws(() => f.agent.submitCommand('pos'), /closed/)
})

test('planner and API/context traces remain linked without a legacy tick', async t => {
  const f = fixture(t)
  const manager = { agents: new Map([[f.agent.name, f.agent]]), agentConfigs: new Map(), config: {}, eventBus: f.bus }
  const store = getDebugStore(manager); t.after(() => store.close())
  const request = await f.brain.requestDecision({ trigger: 'node_requested' })
  const decision = await request.result
  const action = f.brain.submitDecision(decision, { nodeId: 'node-3' })
  await action.result
  const snapshot = store.snapshot(f.agent.name)
  assert.equal(snapshot.turns[0].requestId, request.requestId)
  assert.equal(snapshot.turns[0].trigger, 'node_requested')
  assert.ok(snapshot.turns[0].callIds.includes(action.callId))
  assert.equal(snapshot.calls[0].nodeId, 'node-3')
  assert.equal(snapshot.calls[0].contextId, decision.contextId)
})

test('caller can cancel execution independently after planning has settled', async t => {
  const f = fixture(t), controller = new AbortController()
  f.brain.llm.chat = async () => 'wait 1'
  const request = await f.brain.requestDecision()
  const execution = f.brain.submitDecision(await request.result, { signal: controller.signal })
  await f.entered.promise
  controller.abort(new Error('node interrupted'))
  assert.equal(execution.snapshot().status, 'cancelling')
  assert.equal(request.snapshot().status, 'proposed')
  f.release.resolve()
  assert.equal((await execution.result).cancelled, true)
  assert.equal(execution.snapshot().status, 'cancelled')
})

test('explicit requests consume an existing task call budget without automatically executing', async t => {
  const f = fixture(t)
  const { createTask } = require('../src/agent/task_session')
  f.brain.task = createTask('inspect', { maxCalls: 1, maxDurationMs: 10000 })
  await (await f.brain.requestDecision()).result
  assert.equal(f.brain.task.calls, 1)
  assert.equal(f.agent.commandRuntime.records.size, 0)
  await assert.rejects(f.brain.requestDecision(), /budget exhausted/)
})

test('background commands report dispatch rather than behavior completion', async () => {
  const runtime = new CommandRuntime(async () => ({ ok: true, status: 'RUNNING' }))
  const handle = runtime.submit('follow Other')
  await handle.result
  assert.equal(handle.snapshot().status, 'dispatched')
  assert.equal(handle.cancel(), false)
})

test('standalone decisions and submissions account for task usage and execution exactly once', async t => {
  const f = fixture(t)
  const { createTask } = require('../src/agent/task_session')
  f.brain.task = createTask('inspect', { maxCalls: 2, maxDurationMs: 10000 })
  f.brain.llm.chat = async (_messages, { onUsage }) => { onUsage({ total_tokens: 20 }); return 'pos' }
  const request = await f.brain.requestDecision()
  const command = f.brain.submitDecision(await request.result)
  await command.result
  assert.equal(f.brain.task.metrics.usage.total_tokens, 20)
  assert.equal(f.brain.task.metrics.reportedUsageCalls, 1)
  assert.equal(f.brain.task.steps, 1)
  assert.ok(f.brain.task.metrics.modelMs > 0)
  assert.ok(f.brain.task.metrics.commandMs > 0)
})

test('command capacity cannot block emergency stop and Promise API retains failure feedback', async t => {
  const f = fixture(t)
  f.agent.commandRuntime.pendingLimit = 1
  f.agent.commands.stop = () => ({ ok: true })
  const action = f.agent.submitCommand('wait 1', { source: 'brain' })
  await f.entered.promise
  assert.equal((await f.agent.executeCommand('pos')).ok, false)
  assert.equal((await f.agent.executeCommand('stop')).ok, true)
  f.release.resolve()
  assert.equal((await action.result).cancelled, true)
})

test('pre-aborted Promise submissions return cancelled feedback without running handlers', async t => {
  const f = fixture(t), controller = new AbortController()
  controller.abort(new Error('caller cancelled'))
  assert.equal((await f.agent.executeCommand('pos', { signal: controller.signal })).cancelled, true)
  assert.equal(f.agent.commandRuntime.records.size, 0)
})
