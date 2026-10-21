const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { createAgentNbtApi, resolveAgentMemory } = require('../src/nbt/agent_memory')
const { prepareMemoryDebug } = require('../scripts/prepare-memory-debug')
const { createHash } = require('node:crypto')
const { SharedRenderService } = require('../src/render_bridge/service')
const { createApp } = require('../src/web/server/app')
const { compound, string, writeRegion } = require('./nbt/helpers')

async function fixture(t) {
  const gameDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stevex-agent-nbt-'))
  t.after(() => fs.rm(gameDir, { recursive: true, force: true }))
  for (const [i, agentId] of ['alpha', 'beta'].entries()) {
    const root = path.join(gameDir, 'stevex/render/agents/world', agentId)
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(path.join(root, 'owner.properties'),
      `namespace=world\nagentId=${agentId}\nuuid=00000000-0000-0000-0000-00000000000${i}\n`)
    writeRegion(path.join(root, 'terrain_union'), 'minecraft:overworld', 0, 0, 'blocks',
      compound({ '1,64,0': compound({ block: string(i ? 'minecraft:blue_wool' : 'minecraft:oak_stairs') }) }), 1)
  }
  const agents = ['alpha', 'beta'].map(name => ({ name,
    minecraft: { host: 'localhost', port: 25565, version: '1.21.11', username: name } }))
  return { renderer: { enabled: true, memoryNamespace: 'world', gameDir }, agents }
}

const query = { path: 'terrain', fields: ['block', 'pos', 'dim'], limit: 10 }

test('agent NBT queries isolate roots, validate owners and reject traversal', async t => {
  const config = await fixture(t)
  const options = { gameDir: config.renderer.gameDir, memoryNamespace: 'world' }
  const a = await createAgentNbtApi({ ...options, agentId: 'alpha' })
  const b = await createAgentNbtApi({ ...options, agentId: 'beta' })
  assert.equal((await a.query(query)).result[0].block, 'minecraft:oak_stairs')
  assert.equal((await b.query(query)).result[0].block, 'minecraft:blue_wool')
  await assert.rejects(resolveAgentMemory({ ...options, agentId: '../beta' }), { code: 'LOAD_ERROR' })
  await assert.rejects(resolveAgentMemory({ ...options, agentId: 'missing' }), { code: 'SOURCE_MISSING' })
  await fs.writeFile(path.join(a.memory.visionRoot, 'owner.properties'), 'namespace=world\nagentId=beta\n')
  await assert.rejects(createAgentNbtApi({ ...options, agentId: 'alpha' }), { code: 'SOURCE_CORRUPT' })
  a.clearCache(); b.clearCache()
})

test('service reads fresh captured NBT without creating a player or connecting a renderer', async t => {
  const config = await fixture(t)
  const renderer = { isConnected: () => false, close() {}, call() { throw new Error('Unexpected Mod call') } }
  const service = new SharedRenderService(config.renderer, config.agents, renderer)
  t.after(() => service.close())
  const a = await service.queryNbt('alpha', query)
  assert.equal(a.agentId, 'alpha')
  assert.equal(a.source, 'captured-client-nbt')
  const root = path.join(config.renderer.gameDir, 'stevex/render/agents/world/alpha/terrain_union')
  writeRegion(root, 'minecraft:overworld', 0, 0, 'blocks',
    compound({ '1,64,0': compound({ block: string('minecraft:stone') }) }), 2)
  assert.equal((await service.queryNbt('alpha', query)).result[0].block, 'minecraft:stone')
  await assert.rejects(service.queryNbt('unknown', query), /not registered/)
  await assert.rejects(service.queryNbt('alpha', { ...query, path: '../beta' }), { code: 'LOAD_ERROR' })
})

test('memory debugger copies one agent and keeps all feedback outside live memory', async t => {
  const config = await fixture(t)
  const live = path.join(config.renderer.gameDir, 'stevex/render/agents/world/alpha')
  await fs.writeFile(path.join(live, 'memory_cells.bin'), 'original-feedback')
  const debug = await prepareMemoryDebug(config, 'alpha')
  const debugRoot = path.resolve(__dirname, '../runs/memory-debug')
  assert.equal(path.dirname(debug.gameDir), debugRoot)
  t.after(() => fs.rm(debug.gameDir, { recursive: true, force: true }))
  const settings = JSON.parse(await fs.readFile(path.join(debug.gameDir, 'config/stevex-test/memory.json')))
  assert.equal(settings.sourceFile, path.join(debug.snapshot, 'block_entities'))
  assert.equal(settings.removalEnabled, false)
  assert.equal(settings.snapshotDebug, true)
  assert.match(await fs.readFile(path.join(debug.gameDir, 'options.txt'), 'utf8'), /maxFps:30/)
  assert.equal(path.dirname(settings.memoryCellsFile), path.join(debug.gameDir, 'feedback'))
  await assert.rejects(fs.stat(path.join(debug.snapshot, 'memory_cells.bin')), { code: 'ENOENT' })
  await fs.mkdir(path.dirname(settings.memoryCellsFile), { recursive: true })
  await fs.writeFile(settings.memoryCellsFile, 'debug-feedback')
  assert.equal(await fs.readFile(path.join(live, 'memory_cells.bin'), 'utf8'), 'original-feedback')
  const snapshot = require('../src/nbt').createNbtQueryApi({ visionRoot: debug.snapshot })
  assert.equal((await snapshot.query(query)).result[0].block, 'minecraft:oak_stairs')
  await assert.rejects(prepareMemoryDebug(config, 'unknown'), /not found/)
})

test('HTTP NBT endpoint scopes the agent and reports missing, disabled and invalid queries', async t => {
  const config = await fixture(t)
  const service = new SharedRenderService(config.renderer, config.agents,
    { isConnected: () => false, close() {} })
  const manager = { agentConfigs: new Map(config.agents.map(agent => [agent.name, agent])), renderService: service }
  const server = createApp(manager).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await service.close()
  })
  const request = (name, body = query) => fetch(`http://127.0.0.1:${server.address().port}/api/agents/${name}/nbt/query`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const response = await request('beta')
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.agentId, 'beta')
  assert.equal(data.result[0].block, 'minecraft:blue_wool')
  assert.equal((await request('missing')).status, 404)
  assert.equal((await (await request('alpha', { ...query, path: '../beta' })).json()).code, 'LOAD_ERROR')
  manager.renderService = null
  assert.match((await (await request('alpha')).json()).error, /disabled/)
})

test('live feedback is explicit and fixes source identity and feedback paths to one agent', async t => {
  const config = await fixture(t)
  const debug = await prepareMemoryDebug(config, 'alpha', { liveFeedback: true })
  const debugRoot = path.resolve(__dirname, '../runs/memory-debug')
  assert.equal(path.dirname(debug.gameDir), debugRoot)
  t.after(() => fs.rm(debug.gameDir, { recursive: true, force: true }))
  const live = path.join(config.renderer.gameDir, 'stevex/render/agents/world/alpha')
  const settings = JSON.parse(await fs.readFile(path.join(debug.gameDir, 'config/stevex-test/memory.json')))
  assert.equal(settings.removalEnabled, true)
  assert.equal(settings.sourceFile, path.join(live, 'block_entities'))
  assert.equal(settings.memoryCellsFile, path.join(live, 'memory_cells.bin'))
  assert.equal(settings.memorySpritesFile, path.join(live, 'memory_sprites.bin'))
  assert.equal(settings.sourceOwnerSha256, createHash('sha256').update(await fs.readFile(path.join(live, 'owner.properties'))).digest('hex'))
  assert.equal(debug.snapshot, null)
  await assert.rejects(fs.stat(settings.memoryCellsFile), { code: 'ENOENT' })
})
