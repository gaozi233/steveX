// Production Brain/HTTP wiring, simulated provider and game effects. No paid calls.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path')
const { startPreview } = require('./planner-task-preview')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function run() {
  const fixture = await startPreview(0)
  const base = `http://127.0.0.1:${fixture.server.address().port}`
  const report = { fixture: 'simulated model/game, actual Brain/HTTP', paidCalls: 0, cases: [] }
  const post = async (name, route, body) => {
    const response = await fetch(`${base}/api/agents/${name}/planner/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { http: response.status, ...await response.json() }
  }
  const debug = async name => (await fetch(`${base}/api/agents/${name}/debug`)).json()
  async function settle(name) {
    for (let i = 0; i < 200; i++) {
      const state = await debug(name)
      if (state.task?.status !== 'running' && !fixture.manager.agents.get(name).brainLoop.inFlight) return state
      await delay(20)
    }
    throw Error('Fixture did not settle')
  }
  try {
    const first = await post('Planner-A', 'message', { message: 'Inspect and report', mode: 'once', operation: 'new' })
    const continued = await post('Planner-A', 'control', { operation: 'continue', taskId: first.task.id })
    assert.equal(continued.task.id, first.task.id); assert.equal(continued.task.calls, 2)
    assert.equal(continued.command, 'say mock inventory: stone x2')
    const snapshot = await debug('Planner-A')
    assert.equal(snapshot.turns[0].messages[0].content, snapshot.turns[1].messages[0].content)
    assert.equal(snapshot.turns[1].executionStatus, 'returned')
    assert.ok(snapshot.turns[1].timings.commandMs >= 0)
    assert.equal((await debug('Planner-B')).turns.length, 0)
    report.cases.push({ name: 'single-step continuation, fixed system, actual feedback and isolation', passed: true, task: continued.task })

    const began = performance.now()
    await post('Planner-A', 'message', { message: 'Bounded chain', mode: 'continuous', operation: 'new', limits: { maxCalls: 2 } })
    const bounded = await settle('Planner-A')
    assert.equal(bounded.task.status, 'budget_exhausted'); assert.equal(bounded.task.calls, 2)
    assert.ok(performance.now() - began < 10000, 'Legacy one-hour interval must not delay a task chain')
    report.cases.push({ name: 'bounded continuous task ignores legacy idle interval', passed: true, elapsedMs: performance.now() - began, task: bounded.task })

    const late = post('Planner-A', 'message', { message: 'Cancel inference', mode: 'once', operation: 'new' })
    for (let i = 0; i < 100 && !fixture.manager.agents.get('Planner-A').brainLoop.inFlight; i++) await delay(5)
    const before = fixture.executions.filter(row => row.name === 'Planner-A').length
    const cancelled = await post('Planner-A', 'control', { operation: 'cancel' })
    assert.equal(cancelled.task.status, 'cancelled')
    const other = await post('Planner-B', 'message', { message: 'Independent task', mode: 'once' })
    assert.equal(other.http, 200)
    await late; await settle('Planner-A')
    assert.equal(fixture.executions.filter(row => row.name === 'Planner-A').length, before)
    report.cases.push({ name: 'late cancellation cannot execute or block another agent', passed: true })
  } finally {
    fixture.close()
    const folder = path.resolve(__dirname, '../runs/task-runtime')
    await fs.mkdir(folder, { recursive: true })
    const file = path.join(folder, `acceptance-${Date.now()}.json`)
    await fs.writeFile(file, JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ file, passed: report.cases.length, paidCalls: 0 }))
  }
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1 })
