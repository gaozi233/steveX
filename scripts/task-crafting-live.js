// Supervises production task HTTP APIs; fixture and scoring data never enter model context.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { cases: basicCases, stressCases, terminalState, targetsOf, expectedTargets } = require('./craft-llm-acceptance')
const root = path.resolve(__dirname, '..'), origin = 'http://127.0.0.1:8090'
const name = 'Task-A', player = 'SteveX-TaskA', directory = path.join(root, 'runs/task-runtime')
const report = { startedAt: new Date().toISOString(), method: 'production continuous Brain, full default catalog, unchanged historical goals; external evaluator controls termination, not model planning', cases: [] }
const output = path.join(directory, 'crafting-live-' + Date.now() + '.json')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const rcon = text => execFileSync(process.execPath, [path.join(root, 'runs/api-acceptance-server/rcon.cjs'), text], { encoding: 'utf8', timeout: 15000 }).trim()
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2))
async function api(route, body) {
  const response = await fetch(origin + route, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  const result = await response.json()
  if (!response.ok) throw Object.assign(Error(result.error || JSON.stringify(result)), { result })
  return result
}
const route = suffix => `/api/agents/${name}/${suffix}`
const status = async () => (await api('/api/status')).agents.find(agent => agent.name === name)
const control = (operation, taskId) => api(route('planner/control'), { operation, taskId })
function countServer(item) {
  const response = rcon(`clear ${player} ${item} 0`), match = response.match(/Found (\d+) matching item/)
  if (match) return Number(match[1])
  if (/No items were found/.test(response)) return 0
  throw Error('Unexpected server count response')
}
function assessOutcome(scenario, slots, serverCounts, declaration) {
  const count = item => slots.filter(slot => slot.name === item).reduce((n, slot) => n + slot.count, 0)
  const targetsPassed = Object.entries(expectedTargets(scenario)).every(([item, n]) => count(item) === n && serverCounts[item] === n)
  const declarationPassed = declaration === (scenario.expectedBlocked ? 'BLOCKED' : 'DONE')
  const preserved = { ...(scenario.expectedBlocked ? scenario.inputs : {}), ...scenario.preserve }
  const materialsPreserved = Object.entries(preserved).every(([item, n]) => count(item) === n && serverCounts[item] === n)
  return { targetsPassed, declarationPassed, materialsPreserved, passed: targetsPassed && declarationPassed && materialsPreserved }
}
async function main() {
  if (!process.argv.includes('--live')) { console.log(JSON.stringify({ cases: stressCases, maxCalls: 140, caseCalls: 36, caseMs: 240000 }, null, 2)); return }
  fs.mkdirSync(directory, { recursive: true })
  const original = await status(); assert.ok(original?.online)
  assert.ok(!original.brain?.running, 'Do not interrupt an active user task')
  const chosen = process.argv.indexOf('--case')
  const cases = chosen < 0 ? stressCases : [...stressCases, ...basicCases].filter(c => c.id === process.argv[chosen + 1])
  assert.ok(cases.length, 'Unknown case')
  assert.ok(cases.every(c => !c.seed), 'Seeded history fixtures are not supported by this production HTTP test')
  const started = Date.now(), deadline = started + 900000
  let globalCalls = 0, currentId, tablePlaced = false
  try {
    rcon(`gamemode survival ${player}`)
    rcon(`tp ${player} 720.5 -60 300.5`)
    const empty = rcon('execute if block 722 -60 300 air run time query gametime')
    assert.match(empty, /The time is/, 'Fixture table position must be empty')
    rcon('setblock 722 -60 300 crafting_table'); tablePlaced = true
    await sleep(600)
    for (const scenario of cases) {
      if (globalCalls >= 140 || Date.now() >= deadline) { report.interrupted = 'global-budget'; break }
      rcon(`clear ${player}`)
      for (const [item, count] of Object.entries(scenario.inputs)) rcon(`give ${player} ${item} ${count}`)
      await sleep(350)
      const row = { id: scenario.id, goal: scenario.goal, fixture: scenario.inputs, startedAt: Date.now(), turns: [] }
      report.cases.push(row); save()
      const response = await api(route('planner/message'), { operation: 'new', mode: 'continuous', message: scenario.goal,
        limits: { maxCalls: Math.min(36, 140 - globalCalls), maxDurationMs: Math.min(240000, deadline - Date.now()) } })
      currentId = response.task.id; row.taskId = currentId
      const observed = new Map()
      while (true) {
        const debug = await api(route('debug'))
        for (const turn of debug.turns.filter(t => t.taskId === currentId)) observed.set(turn.requestId, turn)
        row.turns = [...observed.values()].sort((a, b) => a.startedAt - b.startedAt)
        row.task = debug.task; save()
        const declaration = row.turns.find(t => t.executionStatus === 'returned' && terminalState(t.command))
        if (declaration) {
          row.declaration = terminalState(declaration.command)
          // Evaluation is external; the Brain itself still has no automatic DONE rule.
          await control('pause', currentId).catch(() => {})
          row.stopReason = 'model-declaration'; break
        }
        if (['budget_exhausted', 'blocked', 'failed', 'cancelled', 'completed', 'waiting_user', 'paused'].includes(debug.task.status)) {
          row.stopReason = debug.task.reason; break
        }
        if (Date.now() >= deadline) { await control('cancel', currentId); row.stopReason = 'global-deadline'; break }
        await sleep(100)
      }
      // Wait for any cancellation/last execution to settle before taking final counts.
      for (let i = 0; i < 100; i++) { if (!(await status()).execution?.active) break; await sleep(100) }
      const finalDebug = await api(route('debug'))
      for (const turn of finalDebug.turns.filter(t => t.taskId === currentId)) observed.set(turn.requestId, turn)
      row.turns = [...observed.values()].sort((a,b) => a.startedAt-b.startedAt)
      row.task = finalDebug.task; globalCalls += row.task.calls
      row.inventory = await api(route('command'), { command: 'inventory slots' })
      const slots = row.inventory.slots
      const checkedItems = [...new Set([...Object.keys(targetsOf(scenario)), ...Object.keys(scenario.preserve || {}), ...(scenario.expectedBlocked ? Object.keys(scenario.inputs) : [])])]
      row.serverCounts = Object.fromEntries(checkedItems.map(item => [item, countServer(item)]))
      Object.assign(row, assessOutcome(scenario, slots, row.serverCounts, row.declaration))
      row.elapsedMs = Date.now() - row.startedAt
      row.failedCommands = row.turns.filter(t => t.executionStatus === 'failed').map(t => ({ command: t.command, result: t.execution }))
      await control(row.passed ? (scenario.expectedBlocked ? 'block' : 'complete') : 'cancel', currentId).catch(() => {})
      console.log(JSON.stringify({ id: row.id, passed: row.passed, calls: row.task.calls, declaration: row.declaration, stopReason: row.stopReason, failures: row.failedCommands.map(t=>t.command), seconds: Math.round(row.elapsedMs/1000) }))
      currentId = null; save()
    }
  } finally {
    if (currentId) await control('cancel', currentId).catch(() => {})
    rcon(`clear ${player}`)
    if (tablePlaced) rcon('setblock 722 -60 300 air')
    rcon(`tp ${player} ${original.position.x} ${original.position.y} ${original.position.z}`)
    rcon(`gamemode ${original.gameMode} ${player}`)
    report.finishedAt = new Date().toISOString(); report.modelCalls = globalCalls; save()
    console.log('REPORT ' + output)
  }
}
if (require.main === module) main().catch(error => { report.error = error.message; save(); console.error(error.message); process.exitCode = 1 })
module.exports = { assessOutcome }
