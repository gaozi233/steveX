const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { ActionExecutor, sleep } = require('../src/agent/action_executor')
const { SteveXAgent } = require('../src/agent/agent')
const move = require('../src/commands/actions/move')
const follow = require('../src/commands/actions/follow')

test('actions serialize and failure does not strand the queue', async () => {
  const executor = new ActionExecutor()
  let active = 0, peak = 0
  const action = () => executor.run('move', async () => {
    active++; peak = Math.max(peak, active)
    await sleep(5)
    active--
    return true
  })
  await Promise.all([action(), action(), action()])
  assert.equal(peak, 1)
  await assert.rejects(executor.run('bad', () => { throw Error('bad') }), /bad/)
  assert.equal(await action(), true)
})

test('cancelling an uncooperative action never releases its successor early', async () => {
  const executor = new ActionExecutor()
  let release, nextStarted = false
  const first = executor.run('old', () => new Promise(resolve => { release = resolve }))
  await Promise.resolve()
  const rejected = assert.rejects(first, /stopped/)
  executor.cancelAll('stopped')
  const next = executor.run('next', () => { nextStarted = true })
  await sleep(5)
  assert.equal(nextStarted, false)
  release()
  await rejected
  await next
  assert.equal(nextStarted, true)
})

test('deadlines stop physical controls and cooperative waits settle', async () => {
  let stopped = 0
  const executor = new ActionExecutor(() => { stopped++ })
  await assert.rejects(executor.run('wait', signal => sleep(10000, signal), { timeoutMs: 10 }), /timed out/)
  assert.equal(stopped, 1)
  assert.equal(await executor.run('next', () => 'ok'), 'ok')
})

function agentFor(commands, queries = new Set()) {
  const agent = new SteveXAgent({}, 'unit', commands, { queryNames: queries })
  agent.connected = true
  agent.bot = Object.assign(new EventEmitter(), { clearControlStates() {}, setControlState() {},
    pathfinder: { setGoal() {} }, end() {} })
  return agent
}

test('agent uses batch craft deadlines while preserving explicit caller and runtime limits', async () => {
  const agent = agentFor({ craft: async () => ({ ok: true }), look: async () => ({ ok: true }) })
  let timeout
  agent.executor.run = async (_name, operation, options) => { timeout = options.timeoutMs; return operation(new AbortController().signal) }
  await agent.executeCommand('craft powered_rail 64 table')
  assert.equal(timeout, 93000)
  await agent.executeCommand('look 0 0')
  assert.equal(timeout, 30000)
  agent.config.runtime = { actionTimeoutMs: 2000 }
  await agent.executeCommand('craft powered_rail 64 table')
  assert.equal(timeout, 2000)
  await agent.executeCommand('craft powered_rail 64 table', { timeoutMs: 1000 })
  assert.equal(timeout, 1000)
})

test('queries do not replace running action status; stop bypasses queue and cancels pending actions', async () => {
  let entered
  const started = new Promise(resolve => { entered = resolve })
  let queuedRan = false
  const agent = agentFor({
    wait: async (bot, args, owner, { signal }) => { entered(); await sleep(10000, signal); return { ok: true } },
    pos: async () => ({ ok: true }),
    later: async () => { queuedRan = true; return { ok: true } },
    stop() {},
  }, new Set(['pos']))
  const waiting = agent.executeCommand('wait 20')
  await started
  const queued = agent.executeCommand('later')
  await agent.executeCommand('pos')
  assert.equal(agent.currentAction, 'wait')
  assert.equal((await agent.executeCommand('stop')).ok, true)
  assert.equal((await waiting).cancelled, true)
  assert.equal((await queued).cancelled, true)
  assert.equal(queuedRan, false)
})

test('move owns its timer until completion or cancellation', async () => {
  const states = []
  const agent = agentFor({ move: move.handler, stop() {} })
  agent.bot.setControlState = (key, value) => states.push([key, value])
  const moving = agent.executeCommand('move forward 10000')
  await sleep(5)
  await agent.executeCommand('stop')
  assert.equal((await moving).cancelled, true)
  assert.deepEqual(states, [['forward', true], ['forward', false]])
})

test('stop issued by the brain also stops autonomous scheduling', async () => {
  const agent = agentFor({ stop() {} })
  let stopped = 0
  agent.brainLoop = { stop() { stopped++ } }
  assert.equal((await agent.executeCommand('stop', { source: 'brain' })).ok, true)
  assert.equal(stopped, 1)
})

test('follow is a replaceable background goal and cleans up listeners', async () => {
  const agent = agentFor({ follow: follow.handler, look: async () => ({ ok: true }) })
  agent.bot.players = { other: { username: 'Other', entity: { position: { x: 1, y: 64, z: 0 } } } }
  assert.equal((await agent.executeCommand('follow Other')).status, 'RUNNING')
  assert.equal(agent.bot.listenerCount('entityGone'), 1)
  await agent.executeCommand('look 0 0')
  assert.equal(agent.bot.listenerCount('entityGone'), 0)
  assert.equal(agent.bot._followCleanup, null)
  await agent.executeCommand('follow Other', { source: 'brain' })
  agent.stopBrainActions()
  assert.equal(agent.bot.listenerCount('entityGone'), 0)
})

test('stopdig interrupts digging without cancelling an unrelated manual action', async () => {
  const stopdig = require('../src/commands/actions/stopdig')
  const agent = agentFor({ move: move.handler, stopdig: stopdig.handler })
  agent.bot.stopDigging = () => {}
  const moving = agent.executeCommand('move forward 30')
  await sleep(5)
  assert.equal((await agent.executeCommand('stopdig')).ok, true)
  assert.equal((await moving).ok, true)
  agent.commands.dig = async (bot, args, owner, { signal }) => { await sleep(10000, signal); return { ok: true } }
  const digging = agent.executeCommand('dig')
  await sleep(5)
  await agent.executeCommand('stopdig')
  assert.equal((await digging).cancelled, true)
})
