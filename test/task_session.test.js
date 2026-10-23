const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Brain } = require('../src/agent/brain')
const { taskLimits } = require('../src/agent/task_session')
const { modelUsage } = require('../src/llm/usage')
const { getDebugStore } = require('../src/web/server/agent_debug')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate) {
  const end = Date.now() + 3000
  while (!predicate()) { if (Date.now() > end) throw Error('Condition timed out'); await delay(5) }
}
function fixture(t, limits = {}) {
  const calls = [], commands = [], bus = new EventEmitter()
  const agent = { name: 'task-a', sessionId: 'session-a', bot: { version: '1.21.11' }, config: { llm: {} },
    isOnline: () => true, executeCommand: async command => { commands.push(command); return { ok: true, output: command === 'inventory slots' ? 'stone x2' : 'request sent' } } }
  const brain = new Brain(agent, { apiKey: 'fixture-secret' }, bus, { allowedCommands: ['inventory', 'pos', 'say'],
    intervalMs: 3600000, failureBackoffMs: 0, taskLimits: { maxCalls: 10, maxDurationMs: 5000, ...limits } })
  agent.brainLoop = brain
  brain.llm.chat = async messages => { calls.push(messages); return 'inventory slots' }
  t.after(() => brain.stop())
  return { brain, agent, calls, commands, bus }
}

test('continuous tool chain advances without legacy idle interval and stops at shared call budget', async t => {
  const f = fixture(t, { maxCalls: 2 })
  f.brain.llm.chat = async messages => { f.calls.push(messages); return f.calls.length === 1 ? 'inventory slots' : 'say stone x2' }
  const started = await f.brain.submitTask('Report inventory', 'continuous')
  await until(() => !f.brain.running)
  assert.equal(started.status, 'started')
  assert.deepEqual(f.commands, ['inventory slots', 'say stone x2'])
  assert.match(f.calls[1][1].content, /stone x2/)
  assert.equal(f.brain.task.status, 'budget_exhausted')
  assert.equal(f.brain.task.reason, 'max_calls')
  assert.equal(f.brain.task.calls, 2)
  assert.equal(f.brain.timer, null); assert.equal(f.brain.deadlineTimer, null)
})

test('configuration auto-start waits for spawn without model calls and does not become an offline polling loop', async t => {
  const f = fixture(t, { maxCalls: 1 })
  let online = false
  f.agent.isOnline = () => online
  f.agent.isConnecting = () => !online
  f.brain.intervalMs = 10
  assert.equal(f.brain.start(), true)
  await delay(20)
  assert.equal(f.calls.length, 0); assert.equal(f.brain.running, true)
  online = true
  await until(() => !f.brain.running)
  assert.equal(f.calls.length, 1); assert.equal(f.brain.task.status, 'budget_exhausted')
})

test('continue keeps task ID, history and budgets; repeated queries are metrics, not proof of no progress', async t => {
  const f = fixture(t, { maxCalls: 2 })
  const first = await f.brain.submitTask('Inspect')
  assert.equal(first.task.status, 'paused')
  const second = await f.brain.controlTask('continue', { taskId: first.task.id })
  assert.equal(second.task.id, first.task.id)
  assert.match(f.calls[1][1].content, /inventory slots ->/)
  assert.equal(second.task.calls, 2)
  assert.equal(second.task.metrics.repeatedQueries, 1)
  assert.equal(second.task.status, 'budget_exhausted')
  assert.equal((await f.brain.controlTask('continue')).errorCode, 'TASK_ENDED')
  assert.equal((await f.brain.submitTask('more', 'once', { operation: 'append' })).errorCode, 'TASK_ENDED')
})

test('follow-up retains original goal and history without changing fixed system or resetting budget', async t => {
  const f = fixture(t)
  const first = await f.brain.submitTask('original task')
  const system = f.calls[0][0].content
  const second = await f.brain.submitTask('please send result to chat', 'once', { operation: 'append' })
  assert.equal(second.task.id, first.task.id)
  assert.equal(f.brain.goal, 'original task')
  assert.equal(f.calls[1][0].content, system)
  assert.match(f.calls[1][1].content, /stone x2/)
  assert.match(f.calls[1][1].content, /please send result to chat/)
  assert.equal(second.task.calls, 2)
  assert.equal((await f.brain.submitTask('more', 'once', { operation: 'append', limits: { maxCalls: 99 } })).ok, false)
})

test('follow-up during inference discards outdated command and is consumed by next bounded step', async t => {
  const f = fixture(t, { maxCalls: 2 })
  let release
  f.brain.llm.chat = async messages => {
    f.calls.push(messages)
    if (f.calls.length === 1) return new Promise(resolve => { release = resolve })
    return 'pos'
  }
  await f.brain.submitTask('start', 'continuous')
  await until(() => release)
  const queued = await f.brain.submitTask('new constraint', 'once', { operation: 'append' })
  assert.equal(queued.status, 'queued')
  release('say outdated')
  await until(() => !f.brain.running)
  assert.deepEqual(f.commands, ['pos'])
  assert.match(f.calls[1][1].content, /new constraint/)
  assert.equal(f.brain.task.calls, 2)
})

test('cancel waits for uncooperative request settlement before replacement and prevents late actions', async t => {
  const f = fixture(t)
  let release
  f.brain.llm.chat = () => new Promise(resolve => { release = resolve })
  const pending = f.brain.submitTask('first')
  await until(() => release)
  const id = f.brain.task.id
  assert.equal((await f.brain.controlTask('cancel')).task.status, 'cancelled')
  assert.equal((await f.brain.submitTask('second')).errorCode, 'BRAIN_BUSY')
  release('say stale'); await pending
  assert.deepEqual(f.commands, [])
  f.brain.llm.chat = async () => 'pos'
  assert.notEqual((await f.brain.submitTask('second')).task.id, id)
})

test('deadline stops inference even when provider ignores abort, without releasing new work early', async t => {
  const f = fixture(t, { maxDurationMs: 40 })
  let release
  f.brain.llm.chat = () => new Promise(resolve => { release = resolve })
  await f.brain.submitTask('slow', 'continuous')
  await until(() => f.brain.task.status === 'budget_exhausted')
  assert.equal(f.brain.task.reason, 'max_duration')
  assert.equal((await f.brain.submitTask('replacement')).errorCode, 'BRAIN_BUSY')
  release('pos'); await until(() => !f.brain.inFlight)
  assert.deepEqual(f.commands, [])
})

test('consecutive invalid replies and command failures block rather than running indefinitely', async t => {
  const f = fixture(t, { maxConsecutiveFailures: 2 })
  f.brain.llm.chat = async () => 'bad format'
  await f.brain.submitTask('try', 'continuous')
  await until(() => !f.brain.running)
  assert.equal(f.brain.task.status, 'blocked')
  assert.equal(f.brain.task.metrics.invalidReplies, 2)
  f.brain.llm.chat = async () => 'pos'
  f.agent.executeCommand = async () => ({ ok: false, error: 'not available' })
  await f.brain.controlTask('continue', { mode: 'continuous' })
  await until(() => !f.brain.running)
  assert.equal(f.brain.task.status, 'blocked')
  assert.equal(f.brain.task.metrics.failedCommands, 2)
})

test('task dispositions are manual declarations, not say text or environment verification', async t => {
  const f = fixture(t)
  f.brain.llm.chat = async () => 'say DONE'
  await f.brain.submitTask('task')
  assert.equal(f.brain.task.status, 'paused')
  assert.equal((await f.brain.controlTask('wait')).task.status, 'waiting_user')
  assert.equal((await f.brain.controlTask('block')).task.status, 'blocked')
  assert.equal((await f.brain.controlTask('complete')).task.completionVerification, 'not_verified')
  f.brain.stop()
  assert.equal(f.brain.task.status, 'completed')
  assert.equal((await f.brain.controlTask('continue')).errorCode, 'TASK_ENDED')
})

test('limits and stale task identities reject without changing the active task', async t => {
  const f = fixture(t)
  assert.equal((await f.brain.submitTask('x', 'once', { limits: { maxCalls: 0 } })).errorCode, 'INVALID_TASK')
  await f.brain.submitTask('task')
  assert.equal((await f.brain.controlTask('cancel', { taskId: 'stale' })).errorCode, 'TASK_CHANGED')
  assert.equal((await f.brain.submitTask('append', 'once', { operation: 'append', taskId: 'stale' })).errorCode, 'TASK_CHANGED')
  assert.throws(() => taskLimits({ unknown: 1 }))
  assert.equal(modelUsage({ prompt_tokens: -1 }), null)
})

test('step trace joins task, timings, reported usage and actual command feedback without secrets', async t => {
  const f = fixture(t)
  const manager = { agents: new Map([[f.agent.name, f.agent]]), agentConfigs: new Map(), eventBus: f.bus, config: {} }
  const store = getDebugStore(manager); t.after(() => store.close())
  f.brain.llm.chat = async (messages, { onUsage }) => { onUsage({ prompt_tokens: 20, completion_tokens: 2, total_tokens: 22, prompt_cache_hit_tokens: 10 }); return 'pos' }
  f.agent.executeCommand = async (command, { onTiming }) => { await delay(10); onTiming({ queueMs: 3, executionMs: 5 }); return { ok: true, output: 'result fixture-secret' } }
  const result = await f.brain.submitTask('task fixture-secret')
  const snapshot = store.snapshot(f.agent.name), turn = snapshot.turns[0]
  assert.equal(turn.taskId, result.task.id); assert.equal(turn.executionStatus, 'returned')
  assert.equal(turn.timings.queueMs, 3); assert.equal(turn.timings.executionMs, 5)
  assert.equal(turn.usage.prompt_cache_hit_tokens, 10)
  assert.equal(result.task.metrics.usage.total_tokens, 22)
  assert.equal(result.task.metrics.unreportedUsageCalls, 0)
  assert.doesNotMatch(JSON.stringify(snapshot), /fixture-secret/)
  assert.equal(result.task.goal.includes('fixture-secret'), false)
  f.brain.llm.chat = async () => 'pos'
  const second = await f.brain.controlTask('continue')
  assert.equal(second.task.metrics.unreportedUsageCalls, 1)
})
