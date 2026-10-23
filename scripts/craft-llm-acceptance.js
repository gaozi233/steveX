const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { Brain } = require('../src/agent/brain')
const { craftTimeoutMs } = require('../src/commands/craft_timing')

const allowed = ['inventory', 'recipes', 'craft', 'say']
const cases = [
  { id: 'bed-color', target: 'white_bed', count: 1, inputs: { white_wool: 3, oak_log: 2 },
    goal: '先查相关配方，再只用背包现有材料制作一张任意颜色的床，不要求红色。旁边已有可用工作台。自行分解任务，不采集、不染色。完成后 say DONE。' },
  { id: 'iron-alternatives', target: 'iron_ingot', count: 1, inputs: { iron_nugget: 9, iron_block: 1 }, preserve: { iron_block: 1 },
    goal: '先查询 iron_ingot 的全部配方，比较背包可用方案，制作恰好一个铁锭，不要产生多余铁锭。只用现有材料，自行选择方案。完成后 say DONE。' },
  { id: 'wooden-pickaxe', target: 'wooden_pickaxe', count: 1, inputs: { oak_log: 3 },
    goal: '先查相关配方，再只用背包现有材料制作一把木镐，自行分解任务。旁边有可用工作台，不需要采集或建造。完成后 say DONE。' },
  { id: 'recover-from-failure', target: 'stick', count: 8, inputs: { oak_log: 1 }, seed: 'craft stick 2 auto',
    goal: '先查相关配方，只用背包现有材料制作八根木棍，已有一次合成失败反馈，请自主调整步骤。完成后 say DONE。' },
  { id: 'available-selection', target: 'iron_ingot', count: 1, inputs: { iron_nugget: 9, iron_block: 1 }, preserve: { iron_block: 1 }, seed: 'craft iron_ingot 1 auto', availableSelection: true,
    goal: '制作恰好一个铁锭，不要产生多余铁锭。已有一次合成返回当前可用方案列表，请自行比较并选择执行。完成后 say DONE。' }
]

const stressCases = [
  { id: 'recycle-transport', targets: { hopper: 1, chest_minecart: 1 }, inputs: { iron_block: 2, oak_log: 4 },
    goal: '只用背包材料，最终同时拥有漏斗 hopper 1 个和运输矿车 chest_minecart 1 个。旁边已有工作台，不能补给。按需查询相关配方，自主分解并执行任务，完成核对后 say DONE。' },
  { id: 'dispenser-chain', targets: { dispenser: 1 }, inputs: { oak_log: 2, string: 3, cobblestone: 7, redstone_block: 1 },
    goal: '只用背包材料制作发射器 dispenser 1 个。旁边已有工作台，不许补给。先查询目标相关配方，自主分解依赖并执行，核对完成后 say DONE。' },
  { id: 'mixed-wood-budget', targets: { white_bed: 1, shield: 1, wooden_pickaxe: 1, chest: 1 }, inputs: { oak_log: 2, spruce_log: 4, iron_nugget: 9, white_wool: 3 },
    goal: '只用背包材料，最终同时拥有白床 1、盾牌 1、木镐 1、箱子 1。旁边已有工作台。查询相关配方，自主分配不同木材和共享中间材料，不得补给；全部核对达标后 say DONE。' },
  { id: 'redstone-tight-budget', targets: { comparator: 2, repeater: 2, observer: 2, sticky_piston: 2 },
    inputs: { oak_log: 3, iron_block: 1, redstone_block: 2, cobblestone: 20, quartz: 4, stone: 12, slime_ball: 2 },
    goal: '只用背包材料，最终同时拥有比较器 comparator 2、中继器 repeater 2、侦测器 observer 2、黏性活塞 sticky_piston 2。旁边已有工作台。先查询目标相关配方，自主分解并分配共享原料，不能补给；不是各做完就消耗掉，而是最终背包中同时满足这些数量。核对完成后 say DONE。' },
  { id: 'bulk-iron-recycling', targets: { anvil: 2, hopper: 4, chest_minecart: 2 }, inputs: { iron_block: 11, oak_log: 12 },
    goal: '只用背包材料，最终同时拥有铁砧 anvil 2、漏斗 hopper 4、运输矿车 chest_minecart 2。旁边已有工作台。先查询目标相关配方，自主规划块与锭的转换及共享材料，不得补给；核对全部完成后 say DONE。' },
  { id: 'powered-rail-384', targets: { powered_rail: 384 }, inputs: { gold_block: 43, redstone_block: 8, oak_log: 8 },
    goal: '只用背包材料，最终拥有恰好 384 根动力铁轨 powered_rail。旁边已有工作台。先查目标配方，自主分解与批量执行，不得补给；注意配方执行次数和产出数量可能不同。核对完成后 say DONE。' },
  { id: 'insufficient-anvil', targets: { anvil: 1 }, inputs: { iron_block: 3 }, expectedBlocked: true,
    goal: '只允许使用背包现有材料，没有补给，旁边已有工作台。先查 anvil 配方，判断能否合成 1 个铁砧：能则自主完成并 say DONE；若材料不足且无法通过配方转换满足，say BLOCKED，不要假报成功或无效循环。' }
]

function targetsOf(scenario) {
  return scenario.targets || { [scenario.target]: scenario.count }
}

function expectedTargets(scenario) {
  return Object.fromEntries(Object.entries(targetsOf(scenario)).map(([item, count]) => [item, scenario.expectedBlocked ? 0 : count]))
}

function terminalState(command) {
  return typeof command === 'string' ? command.match(/^say\s+(DONE|BLOCKED)(?=$|[^\p{L}\p{N}_])/iu)?.[1].toUpperCase() || null : null
}

function safeCommand(command) {
  if (typeof command !== 'string' || /[\r\n]/.test(command)) return false
  // Explanations after the terminal marker are ordinary chat, not extra commands.
  if (terminalState(command)) return true
  // Let the actual API validate arguments, rather than inventing a narrower grammar.
  return !command.includes(';') && /^(inventory|recipes|craft)(?:\s|$)/i.test(command)
}

function assess(scenario, inventory, commands, seedResult) {
  const count = item => inventory.filter(i => i.name === item).reduce((n, i) => n + i.count, 0)
  return {
    targetPassed: Object.entries(expectedTargets(scenario)).every(([item, n]) => count(item) === n),
    preservedPassed: Object.entries(scenario.preserve || {}).every(([item, n]) => count(item) === n),
    recipeInformationPassed: scenario.availableSelection
      ? seedResult?.errorCode === 'RECIPE_SELECTION_REQUIRED' && seedResult.availableRecipes?.length > 1 && commands.some(command => {
        const parts = command.split(' ')
        return parts[0] === 'craft' && parts[1].replace(/^minecraft:/, '') === scenario.target && seedResult.availableRecipes.some(r => r.index === Number(parts[4]))
      })
      : Object.keys(targetsOf(scenario)).every(item => commands.some(command => command === `recipes ${item}` || command === `recipes minecraft:${item}`)),
    completionPassed: scenario.expectedBlocked ? commands.some(c => terminalState(c) === 'BLOCKED') && !commands.some(c => terminalState(c) === 'DONE') : commands.some(c => terminalState(c) === 'DONE')
  }
}

function inventoryItems(result) {
  assert.equal(result.ok, true, 'Inventory query must succeed')
  assert.ok(Array.isArray(result.slots), 'Current inventory slots contract is required')
  return result.slots
}

function serverCount(text) {
  if (/No items were found on player SteveX-Test/.test(text)) return 0
  const match = text.match(/Found (\d+) matching item/)
  if (!match) throw Error('Unexpected non-destructive server item count response')
  return Number(match[1])
}

async function main() {
  const caseArg = process.argv.indexOf('--case')
  const stress = process.argv.includes('--stress')
  const pool = stress ? stressCases : cases
  const selectedCases = caseArg < 0 ? pool : pool.filter(row => row.id === process.argv[caseArg + 1])
  const limits = { maxCallsPerCase: stress ? 36 : 12, maxTotalCalls: stress ? 140 : 60,
    caseTimeoutMs: stress ? 240000 : 180000, totalTimeoutMs: 900000 }
  const budgetArg = process.argv.indexOf('--max-model-calls')
  if (budgetArg >= 0) {
    const raw = process.argv[budgetArg + 1] || '', budget = /^\d+$/.test(raw) ? Number(raw) : NaN
    if (!Number.isInteger(budget) || budget < 1 || budget > limits.maxTotalCalls) throw Error('--max-model-calls may only lower the suite call budget')
    limits.maxTotalCalls = budget
  }
  if (!selectedCases.length) throw Error('Unknown --case; use a case ID from the plan-only output')
  if (!process.argv.includes('--live')) {
    console.log(JSON.stringify({ mode: 'plan-only', cases: selectedCases, allowed, limits,
      note: 'No model or game calls. Live fixtures require an empty, unequipped survival test player; never target the human player.' }, null, 2))
    return
  }
  if (!process.env.DEEPSEEK_API_KEY) throw Error('Missing DEEPSEEK_API_KEY; use the DPAPI PowerShell launcher')
  const root = path.join(__dirname, '..')
  const dir = path.join(root, 'runs/craft-llm')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${Date.now()}.json`)
  const report = { startedAt: new Date().toISOString(), model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    suite: stress ? 'stress' : 'basic', limits, modelCalls: 0,
    method: 'production Brain with local HTTP adapter; fixture/RCON data never included in model input', cases: [] }
  const deadline = Date.now() + limits.totalTimeoutMs
  const save = () => fs.writeFileSync(file, JSON.stringify(report, null, 2))
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
  const rcon = command => execFileSync(process.execPath, [path.join(root, 'runs/api-acceptance-server/rcon.cjs'), command], { encoding: 'utf8', timeout: 15000 }).trim()
  async function api(command) {
    const response = await fetch(`${process.env.STEVEX_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8090'}/api/agents/manual-test/${command ? 'command' : 'state'}`, command
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }), signal: AbortSignal.timeout(command.startsWith('craft ') ? craftTimeoutMs(command.split(/\s+/).slice(1)) + 15000 : 45000) }
      : { signal: AbortSignal.timeout(10000) })
    const result = await response.json()
    if (!response.ok && !(response.status === 400 && result.ok === false)) throw Error(`Local API HTTP ${response.status}`)
    return result
  }
  const original = await api()
  assert.ok(original.ok)
  assert.equal(original.gameMode, 'survival')
  assert.equal(original.inventory.length, 0, 'Refuse to clear a nonempty test inventory')
  assert.ok(!original.equipment, 'Refuse to clear equipped items')
  let fixture = false
  try {
    await api('stop')
    rcon('tp SteveX-Test 720.5 -60 300.5')
    await delay(1000)
    assert.match(rcon('execute if block 722 -60 300 air run time query gametime'), /The time is/)
    rcon('setblock 722 -60 300 crafting_table')
    fixture = true
    await delay(500)
    for (const scenario of selectedCases) {
      if (report.modelCalls >= limits.maxTotalCalls || Date.now() >= deadline) { report.interrupted = 'global-budget'; break }
      const started = Date.now(), caseDeadline = Math.min(deadline, started + limits.caseTimeoutMs)
      const row = { id: scenario.id, goal: scenario.goal, fixture: scenario.inputs, calls: [], executions: [], commands: [], rejectedCommands: [] }
      report.cases.push(row)
      save()
      rcon('clear SteveX-Test')
      for (const [item, n] of Object.entries(scenario.inputs)) rcon(`give SteveX-Test ${item} ${n}`)
      await delay(350)
      const agent = { name: 'manual-test', isOnline: () => true,
        executeCommand: async command => {
          // Brain's fixed state sampling remains read-only; generated actions are separately allowlisted below.
          const began = Date.now(), result = await api(command)
          row.executions.push({ command, elapsedMs: Date.now() - began, result })
          save()
          return result
        } }
      const bus = { emit(event, payload) {
        if (event === 'agent:llm:input') { row.calls.push({ input: payload.input }); save() }
        if (event === 'agent:llm:output') { row.calls.at(-1).response = payload.output; save() }
      } }
      const brain = new Brain(agent, { apiKey: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL,
        baseUrl: process.env.DEEPSEEK_BASE_URL, timeoutMs: 60000 }, bus, { goal: scenario.goal, allowedCommands: allowed })
      const chat = brain.llm.chat.bind(brain.llm)
      brain.llm.chat = async (messages, { signal }) => {
        if (report.modelCalls >= limits.maxTotalCalls || Date.now() >= caseDeadline) throw Error('Acceptance budget exhausted')
        report.modelCalls++
        const call = row.calls.at(-1), began = Date.now()
        Object.assign(call, { inputChars: messages.reduce((n, m) => n + m.content.length, 0),
          historyEntries: brain.history.length, historyChars: JSON.stringify(brain.history).length })
        try { return await chat(messages, { signal: AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, caseDeadline - Date.now()))]) }) }
        finally { call.elapsedMs = Date.now() - began; save() }
      }
      const originalPick = brain.pickCommand.bind(brain)
      brain.pickCommand = raw => {
        const command = originalPick(raw)
        if (!safeCommand(command)) {
          row.rejectedCommands.push({ response: raw, reason: command ? 'acceptance-allowlist' : 'Brain-parser' })
          save()
          return null
        }
        row.commands.push(command)
        return command
      }
      row.system = brain.buildSystem()
      if (scenario.seed) {
        const result = await api(scenario.seed)
        row.seed = { command: scenario.seed, result }
        assert.equal(result.ok, false)
        brain.remember(scenario.seed, `FAILED ${result.nextQuery ? `Next query: ${result.nextQuery}. ` : ''}${result.error}`)
      }
      brain.running = true
      try {
        row.stopReason = 'case-call-limit'
        for (let step = 0; step < limits.maxCallsPerCase; step++) {
          if (report.modelCalls >= limits.maxTotalCalls || Date.now() >= caseDeadline) { row.stopReason = 'budget-or-deadline'; break }
          await brain.tick()
          if (brain.lastError) { row.error = brain.lastError; row.stopReason = 'error'; break }
          if (terminalState(row.commands.at(-1))) { row.stopReason = 'model-terminal'; break }
        }
      } finally { brain.stop() }
      row.finalInventory = await api('inventory slots')
      row.serverInventory = rcon('data get entity SteveX-Test Inventory')
      row.assessment = assess(scenario, inventoryItems(row.finalInventory), row.commands, row.seed?.result)
      row.serverCounts = {}
      for (const item of [...Object.keys(targetsOf(scenario)), ...Object.keys(scenario.preserve || {})]) {
        const response = rcon(`clear SteveX-Test ${item} 0`)
        row.serverCounts[item] = { response, count: serverCount(response) }
      }
      row.assessment.serverTargetPassed = Object.entries(expectedTargets(scenario)).every(([item, n]) => row.serverCounts[item].count === n)
      row.assessment.serverPreservedPassed = Object.entries(scenario.preserve || {}).every(([item, n]) => row.serverCounts[item].count === n)
      row.passed = Object.values(row.assessment).every(Boolean)
      row.elapsedMs = Date.now() - started
      row.metrics = { modelCalls: row.calls.length, maxInputChars: Math.max(0, ...row.calls.map(c => c.inputChars || 0)),
        historyLimitReached: row.calls.some(c => c.historyEntries === 10),
        craftFailures: row.executions.filter(e => e.command.startsWith('craft ') && !e.result.ok).map(e => ({ command: e.command, errorCode: e.result.errorCode, error: e.result.error })) }
      save()
      console.log(row.passed ? 'PASS' : 'FAIL', scenario.id, JSON.stringify(row.assessment), 'calls', row.calls.length)
      if (row.error) { report.interrupted = 'runtime-error'; break }
    }
  } catch (error) {
    report.error = error.message
    throw error
  } finally {
    await api('stop').catch(() => {})
    rcon('clear SteveX-Test')
    if (fixture) rcon('setblock 722 -60 300 air')
    const p = original.position
    rcon(`execute in minecraft:${original.dimension} run tp SteveX-Test ${p.x} ${p.y} ${p.z}`)
    await api(`look angle ${original.orientation.yaw} ${original.orientation.pitch}`)
    report.finishedAt = new Date().toISOString()
    save()
    console.log('LOG', file)
  }
  if (report.interrupted || report.cases.some(row => !row.passed) || report.cases.length !== selectedCases.length) process.exitCode = 1
}

async function run() {
  if (!process.argv.includes('--standalone') || !process.argv.includes('--live')) return main()
  const { AgentManager } = require('../src/agent/agent_manager')
  const { createApp } = require('../src/web/server/app')
  const manager = new AgentManager(() => ({ renderer: { enabled: false }, agents: [{ name: 'manual-test',
    minecraft: { host: '127.0.0.1', port: 25565, username: 'SteveX-Test', version: '1.21.11', auth: 'offline' },
    brain: { enabled: false }, llm: { apiKey: '' } }] }))
  const server = createApp(manager).listen(0, '127.0.0.1')
  const previous = process.env.STEVEX_ACCEPTANCE_ORIGIN
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
    process.env.STEVEX_ACCEPTANCE_ORIGIN = `http://127.0.0.1:${server.address().port}`
    manager.connectAgent('manual-test')
    for (let i = 0; i < 200 && !manager.agents.get('manual-test')?.isOnline(); i++) await new Promise(r => setTimeout(r, 100))
    assert.ok(manager.agents.get('manual-test')?.isOnline(), 'Test player must spawn')
    await main()
  } finally {
    await manager.close()
    require('../src/web/server/agent_debug').getDebugStore(manager).close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    if (previous === undefined) delete process.env.STEVEX_ACCEPTANCE_ORIGIN
    else process.env.STEVEX_ACCEPTANCE_ORIGIN = previous
  }
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { cases, stressCases, safeCommand, assess, serverCount, targetsOf, expectedTargets, terminalState, inventoryItems }
