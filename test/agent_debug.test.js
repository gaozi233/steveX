const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { Brain } = require('../src/agent/brain')
const { getDebugStore } = require('../src/web/server/agent_debug')
const { createApp } = require('../src/web/server/app')

function fixture() {
  const agents = new Map(['a', 'b', '__proto__'].map(name => [name, { name, sessionId: name + '-session',
    isOnline: () => true, config: { llm: { apiKey: 'fixture-secret-never-send' } }, executeCommand: async () => ({ ok: true, output: 'ok' }) }]))
  return { agents, agentConfigs: new Map([...agents].map(([name, agent]) => [name, agent.config])), eventBus: new EventEmitter(), config: {} }
}

test('debug ETags are agent-local and cache hits skip snapshot construction',async t=>{
  const manager=fixture(),server=createApp(manager).listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve))
  const store=getDebugStore(manager)
  t.after(async()=>{store.close();server.closeAllConnections();await new Promise(r=>server.close(r))})
  const url=`http://127.0.0.1:${server.address().port}/api/agents/a/debug?section=api`
  const first=await fetch(url),tag=first.headers.get('etag')
  let snapshots=0;const original=store.snapshot.bind(store);store.snapshot=(...args)=>{snapshots++;return original(...args)}
  manager.eventBus.emit('agent:task:update',{name:'b',sessionId:'b-session'})
  assert.equal((await fetch(url,{headers:{'If-None-Match':tag}})).status,304);assert.equal(snapshots,0)
  manager.eventBus.emit('agent:task:update',{name:'a',sessionId:'old-session'})
  assert.equal((await fetch(url,{headers:{'If-None-Match':tag}})).status,304)
  manager.eventBus.emit('agent:task:update',{name:'a',sessionId:'a-session'})
  assert.equal((await fetch(url,{headers:{'If-None-Match':tag}})).status,200);assert.equal(snapshots,1)
})

test('Brain identifies SteveX and the exact connected Minecraft version', () => {
  const agent = fixture().agents.get('a')
  agent.bot = { version: '1.21.11' }
  const prompt = new Brain(agent, {}, { emit() {} }).buildSystem()
  assert.match(prompt, /You are SteveX/)
  assert.match(prompt, /Minecraft Java Edition 1\.21\.11\./)
  assert.doesNotMatch(prompt, /JeVBot|1\.21\.x/)
  agent.config.minecraft = { version: '1.21.10' }
  assert.match(new Brain(agent, {}, { emit() {} }).buildSystem(), /Edition 1\.21\.11\./)
  delete agent.bot
  assert.match(new Brain(agent, {}, { emit() {} }).buildSystem(), /Edition 1\.21\.10\./)
})

test('Brain resolves only an explicitly configured environment key without adding it to config', () => {
  const variable = 'STEVEX_TEST_DEBUG_KEY'
  const previous = process.env[variable]
  process.env[variable] = 'fixture-environment-only'
  try {
    const config = { apiKeyEnv: variable }
    const brain = new Brain(fixture().agents.get('a'), config, { emit() {} })
    assert.equal(brain.llm.apiKey, 'fixture-environment-only')
    assert.equal(config.apiKey, undefined)
    assert.equal(new Brain(fixture().agents.get('a'), {}, { emit() {} }).llm.apiKey, '')
  } finally {
    if (previous === undefined) delete process.env[variable]
    else process.env[variable] = previous
  }
})

test('Brain records the actual system/user messages and matches raw response by request/session', async t => {
  const manager = fixture(), agent = manager.agents.get('a'), store = getDebugStore(manager)
  t.after(() => store.close())
  const brain = new Brain(agent, {}, manager.eventBus, { goal: 'inspect inventory' })
  brain.running = true
  let sent
  brain.llm.chat = async messages => { sent = structuredClone(messages); return 'pos' }
  await brain.tick()
  const [turn] = store.snapshot('a').turns
  assert.deepEqual(turn.messages, sent)
  assert.equal(turn.response, 'pos')
  assert.equal(turn.command, 'pos')
  assert.equal(turn.status, 'responded')
  assert.equal(store.snapshot('b').turns.length, 0)
  assert.ok(turn.durationMs >= 0)
  brain.stop()
})

test('provider error and ignored-abort late output end the request without executing a late command', async t => {
  const manager = fixture(), agent = manager.agents.get('a'), store = getDebugStore(manager)
  t.after(() => store.close())
  const brain = new Brain(agent, agent.config.llm, manager.eventBus)
  brain.running = true
  brain.llm.chat = async () => { throw new Error('fixture-secret-never-send provider failed') }
  await brain.tick()
  assert.equal(store.snapshot('a').turns[0].status, 'failed')
  assert.doesNotMatch(store.snapshot('a').turns[0].error, /fixture-secret-never-send/)
  assert.doesNotMatch(brain.lastError, /fixture-secret-never-send/)
  let resolve, entered
  const started = new Promise(done => { entered = done })
  brain.llm.chat = async () => { entered(); return new Promise(done => { resolve = done }) }
  const work = brain.tick()
  await started
  brain.stop()
  resolve('say late')
  await work
  assert.equal(store.snapshot('a').turns[1].status, 'cancelled')
  assert.equal(store.snapshot('a').turns[1].response, undefined)
})

test('trace store redacts before storage, bounds retention and rejects old sessions', t => {
  const manager = fixture(), store = getDebugStore(manager)
  t.after(() => store.close())
  for (let i = 0; i < 12; i++) {
    manager.eventBus.emit('agent:llm:input', { name: '__proto__', sessionId: '__proto__-session', requestId: String(i), model: 'fixture',
      messages: [{ role: 'system', content: 'fixture-secret-never-send' }, { role: 'user', content: 'x'.repeat(140000) }], timestamp: i + 1 })
  }
  const turns = store.snapshot('__proto__').turns
  assert.equal(turns.length, 10)
  assert.equal(turns[0].requestId, '2')
  assert.equal(turns[0].messages[0].content, '[REDACTED]')
  assert.equal(turns[0].inputTruncated, true)
  manager.agents.get('__proto__').sessionId = 'new'
  manager.eventBus.emit('agent:llm:output', { name: '__proto__', sessionId: '__proto__-session', requestId: '11', response: 'stale' })
  assert.equal(store.snapshot('__proto__').turns.length, 0)
  const count = manager.eventBus.listenerCount('agent:llm:input')
  store.close()
  assert.equal(manager.eventBus.listenerCount('agent:llm:input'), count - 1)
})

test('debug and RGB routes isolate sessions, use conditional responses and never accept arbitrary file paths', async t => {
  const manager = fixture()
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'stevex-web-debug-'))
  const frameId = randomUUID()
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNcAAAAASUVORK5CYII=', 'base64')
  manager.renderService = { config: { outputDir: directory, memoryNamespace: 'test' }, ids: new Map([['a', 'a'], ['b', 'b']]), renderer: { isConnected: () => true } }
  await fs.mkdir(path.join(directory, 'test/a'), { recursive: true })
  await fs.writeFile(path.join(directory, 'test/a', frameId + '.png'), png)
  manager.captureObservation = async name => ({ ok: true, observation: { agentName: name, sessionId: manager.agents.get(name).sessionId,
    revision: 1, observedAt: new Date().toISOString(), frame: { frameId, agentId: name, memoryNamespace: 'test', width: 1, height: 1, rgb: { file: frameId + '.png' } } } })
  const server = createApp(manager).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const store = getDebugStore(manager)
  t.after(async () => { store.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }) })
  const base = `http://127.0.0.1:${server.address().port}`
  const first = await fetch(base + '/api/agents/a/debug')
  assert.equal(first.status, 200)
  assert.equal((await fetch(base + '/api/agents/a/debug', { headers: { 'If-None-Match': first.headers.get('etag') } })).status, 304)
  const capture = await (await fetch(base + '/api/agents/a/observe', { method: 'POST' })).json()
  assert.equal(capture.ok, true)
  assert.equal(capture.preview.frameId, frameId)
  const image = await fetch(base + capture.preview.rgbUrl)
  assert.equal(image.status, 200)
  assert.match(image.headers.get('content-type'), /image\/png/)
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png)
  assert.equal((await fetch(base + `/api/agents/b/observation/${frameId}/rgb`)).status, 404)
  assert.equal((await fetch(base + '/api/agents/missing/debug')).status, 404)
  assert.equal((await fetch(base + '/api/agents/a/observation/..%2Fprivate/rgb')).status, 404)
  manager.agents.get('a').sessionId = 'reconnected'
  assert.equal((await fetch(base + capture.preview.rgbUrl)).status, 404)
  assert.equal((await (await fetch(base + '/api/agents/a/debug')).json()).observation, null)
})
