const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { SharedRenderService } = require('../src/render_bridge/service')
const { SteveXAgent } = require('../src/agent/agent')
const { sleep } = require('../src/agent/action_executor')
const { checkFrame, poseOf } = require('../src/render_bridge/bridge')

function fixture(identity, bot) {
  const png = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
  png.writeUInt32BE(1, 16); png.writeUInt32BE(1, 20)
  return { ...identity, ok: true, cameraUuid: identity.targetUuid, dimension: 'overworld', width: 1, height: 1,
    timestamp: Date.now(), frameId: require('node:crypto').randomUUID(),
    camera: { position: [bot.entity.position.x, 65.62, 0], yawDegrees: 0, pitchDegrees: 0 },
    rgb: { base64: png.toString('base64') },
    depth: { encoding: 'float32-le-base64', origin: 'top-left', base64: Buffer.alloc(4).toString('base64') } }
}

test('observation rejects wrong identity, dimension, angle and malformed depth', () => {
  const bot = { entity: { uuid: 'target', position: { x: 0, y: 64, z: 0 }, yaw: Math.PI, pitch: 0 }, game: { dimension: 'overworld' } }
  const pose = poseOf(bot)
  const frame = fixture({ agentId: 'a', memoryNamespace: 'world', targetUuid: 'target' }, bot)
  assert.throws(() => checkFrame({ ...frame, cameraUuid: 'other' }, pose, pose, 'a', 'world'), /identity/)
  assert.throws(() => checkFrame({ ...frame, memoryNamespace: 'other' }, pose, pose, 'a', 'world'), /identity/)
  assert.throws(() => checkFrame({ ...frame, dimension: 'the_nether' }, pose, pose, 'a', 'world'), /dimension/)
  assert.throws(() => checkFrame({ ...frame, camera: { ...frame.camera, yawDegrees: 90 } }, pose, pose, 'a', 'world'), /synchronize/)
  assert.throws(() => checkFrame({ ...frame, depth: { ...frame.depth, base64: '' } }, pose, pose, 'a', 'world'), /dimensions/)
})

test('shared renderer uses existing main agents, serializes switches and isolates artifacts', async t => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'stevex-main-render-'))
  t.after(() => fs.rm(out, { recursive: true, force: true }))
  const definitions = ['a', 'b'].map((name, i) => ({ name, minecraft: { host: 'localhost', port: 25565, version: '1.21.11', username: `Bot${i}` } }))
  let selected = {}, current = 0, peak = 0
  const players = new Map()
  const renderer = { isConnected: () => true, close() {}, call: async (method, identity) => {
    if (method === 'render/status') return { ok: true, data: selected }
    if (method === 'render/bind') { selected = { ...identity }; return { ok: true, data: { ok: true } } }
    if (method === 'render/unbind') return { ok: true }
    current++; peak = Math.max(peak, current)
    await sleep(5)
    assert.deepEqual(identity, selected)
    current--
    return { ok: true, data: fixture(identity, players.get(identity.agentId).bot) }
  } }
  const service = new SharedRenderService({ memoryNamespace: 'test-world', outputDir: out }, definitions, renderer)
  t.after(() => service.close())
  for (const [i, cfg] of definitions.entries()) {
    const agent = new SteveXAgent(cfg, cfg.name, {}, { renderService: service })
    agent.connected = true
    agent.bot = { entity: { uuid: `00000000-0000-0000-0000-00000000000${i}`, position: { x: i * 256, y: 64, z: 0 }, yaw: Math.PI, pitch: 0 }, game: { dimension: 'overworld' } }
    players.set(cfg.name, agent)
  }
  const [a, b, again] = await Promise.all([players.get('a').captureObservation(), players.get('b').captureObservation(), players.get('a').captureObservation()])
  assert.ok(a.ok && b.ok && again.ok)
  assert.equal(peak, 1)
  assert.equal(a.observation.revision, 1)
  assert.equal(again.observation.revision, 2)
  assert.equal(b.observation.frame.camera.position[0], 256)
  assert.equal((await fs.readdir(path.join(out, 'test-world', 'a'))).length, 6)
  assert.equal((await fs.readdir(path.join(out, 'test-world', 'b'))).length, 3)
})

test('renderer is optional; disabled observation does not create a second player', async () => {
  const agent = new SteveXAgent({}, 'plain')
  assert.deepEqual(await agent.captureObservation(), { ok: false, error: 'Shared renderer is disabled' })
  assert.equal(agent.bot, null)
})

test('capture cancellation retains its action slot until the renderer settles', async () => {
  let release, started
  const entered = new Promise(resolve => { started = resolve })
  const agent = new SteveXAgent({}, 'cancel', { next: async () => ({ ok: true }) }, {
    renderService: { timeoutMs: 10, capture: () => { started(); return new Promise(resolve => { release = resolve }) } },
  })
  agent.connected = true
  agent.bot = {}
  const pending = agent.captureObservation()
  await entered
  await sleep(15)
  let next = false
  const following = agent.executeCommand('next').then(result => { next = true; return result })
  await sleep(5)
  assert.equal(next, false)
  release({ timestamp: Date.now() })
  assert.equal((await pending).cancelled, true)
  assert.equal((await following).ok, true)
})
