const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { ActionExecutor, sleep } = require('../src/agent/action_executor')
const { SteveXAgent } = require('../src/agent/agent')
const { DeepSeekClient } = require('../src/llm/deepseek_client')
const { Brain } = require('../src/agent/brain')

test('execution timing distinguishes queued actions from read-only queries without changing results', async () => {
  const agent = new SteveXAgent({}, 'timing', {
    wait: async (bot, args, self, { signal }) => { await sleep(15, signal); return { ok: true } },
    pos: async () => ({ ok: true, output: 'position' })
  }, { queryNames: new Set(['pos']) })
  agent.bot = {}; agent.connected = true
  let actionTime, queryTime
  const blocker = agent.executor.run('test-blocker', () => sleep(35))
  const queued = agent.executeCommand('wait 1', { source: 'brain', onTiming: timing => { actionTime = timing } })
  const query = await agent.executeCommand('pos', { source: 'brain', onTiming: timing => { queryTime = timing } })
  assert.equal(query.ok, true); assert.equal(queryTime.queueMs, 0)
  await blocker; assert.equal((await queued).ok, true)
  assert.ok(actionTime.queueMs >= 20); assert.ok(actionTime.executionMs >= 10)
  assert.ok(actionTime.commandMs >= actionTime.queueMs)
  agent.executor.close()
})

test('cancelled queued action reports no execution; timing observers cannot strand a queue', async () => {
  const executor = new ActionExecutor(), controller = new AbortController()
  let timing
  const first = executor.run('first', () => sleep(20))
  const second = executor.run('second', () => { throw Error('must not execute') }, { signal: controller.signal, onTiming: value => { timing = value } })
  const rejected = assert.rejects(second, /cancel/)
  controller.abort(new Error('cancel')); await first; await rejected
  assert.equal(timing.executionMs, 0); assert.ok(timing.queueMs > 0)
  assert.equal(await executor.run('next', async () => 1, { onTiming: () => { throw Error('observer') } }), 1)
})

test('task deadline cancels a real executor action and waits for key cleanup before returning', async () => {
  let held = false
  const agent = new SteveXAgent({}, 'deadline', { wait: async (bot, args, self, { signal }) => {
    held = true
    try { await sleep(1000, signal); return { ok: true } } finally { held = false }
  } })
  agent.bot = { version: '1.21.11' }; agent.connected = true
  const brain = new Brain(agent, { apiKey: 'fixture-only' }, { emit() {} }, { allowedCommands: ['wait'], taskLimits: { maxDurationMs: 40 } })
  agent.brainLoop = brain; brain.llm.chat = async () => 'wait 1'
  const result = await brain.submitTask('wait')
  assert.equal(result.task.status, 'budget_exhausted'); assert.equal(held, false)
  assert.equal(agent.executor.getStatus().pending, 0); assert.equal(brain.inFlight, null)
  brain.stop(); agent.executor.close()
})

test('DeepSeek retains text response contract and reports only provider-supplied usage', async t => {
  const requests = [], server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk
    requests.push(JSON.parse(body))
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: 'pos' } }], ...(requests.length === 1 ? {
      usage: { prompt_tokens: 100, completion_tokens: 2, total_tokens: 102, prompt_cache_hit_tokens: 80, secret: 'not-usage' }
    } : {}) }))
  }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const client = new DeepSeekClient({ apiKey: 'local-fixture', baseUrl: `http://127.0.0.1:${server.address().port}` })
  const usage = []
  assert.equal(await client.chat([{ role: 'user', content: 'query' }], { onUsage: value => usage.push(value) }), 'pos')
  assert.equal(usage[0].prompt_cache_hit_tokens, 80); assert.equal(usage[0].secret, undefined)
  await client.chat([], { onUsage: value => usage.push(value) })
  assert.equal(usage[1], null)
  assert.notEqual(requests[0].stream, true)
})
