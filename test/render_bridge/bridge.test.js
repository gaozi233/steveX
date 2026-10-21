const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { RenderBridge, poseOf, checkFrame } = require('../../src/render_bridge/bridge')

const uuid = '11111111-2222-3333-4444-555555555555'
const bot = () => ({ entity: { uuid, position: { x: 1, y: 64, z: 2 }, yaw: Math.PI / 2, pitch: -Math.PI / 6 }, game: { dimension: 'overworld' } })

function frame() {
  const png = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
  png.writeUInt32BE(2, 16)
  png.writeUInt32BE(2, 20)
  return {
    ok: true, agentId: 'pilot', memoryNamespace: 'default', targetUuid: uuid, cameraUuid: uuid,
    frameId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', dimension: 'minecraft:overworld', width: 2, height: 2,
    camera: { position: [1, 65.62, 2], yawDegrees: 90, pitchDegrees: 30 },
    rgb: { base64: png.toString('base64') },
    depth: { encoding: 'float32-le-base64', origin: 'top-left', base64: Buffer.alloc(16).toString('base64') },
  }
}

test('Mineflayer radians convert to the original client angle convention', () => {
  const pose = poseOf(bot())
  assert.equal(pose.yawDegrees, 90)
  assert.ok(Math.abs(pose.pitchDegrees - 30) < 1e-9)
})

test('rejects another player, dimension, misaligned view and RGB/depth mismatch', () => {
  const pose = poseOf(bot())
  assert.throws(() => checkFrame({ ...frame(), cameraUuid: 'other' }, pose, pose, 'pilot'), /identity/)
  assert.throws(() => checkFrame({ ...frame(), memoryNamespace: 'other' }, pose, pose, 'pilot'), /identity/)
  assert.throws(() => checkFrame({ ...frame(), dimension: 'minecraft:the_nether' }, pose, pose, 'pilot'), /dimension/)
  const turned = frame()
  turned.camera.yawDegrees = 180
  assert.throws(() => checkFrame(turned, pose, pose, 'pilot'), /synchronize/)
  const truncated = frame()
  truncated.depth.base64 = ''
  assert.throws(() => checkFrame(truncated, pose, pose, 'pilot'), /dimensions/)
})

test('capture errors propagate through nested Mod responses without writing artifacts', async () => {
  const out = path.join(os.tmpdir(), `stevex-render-error-${Date.now()}`)
  const bridge = new RenderBridge({ bot: bot(), renderer: {
    isConnected: () => true,
    call: async () => ({ ok: true, data: { ok: false, error: 'not spectator' } }),
  }, agentId: 'pilot', outputDir: out })
  await assert.rejects(bridge.capture(), /not spectator/)
  await assert.rejects(fs.stat(out), { code: 'ENOENT' })
})

test('one worker serializes captures and persists matched RGB/depth/metadata', async t => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'stevex-render-'))
  t.after(() => fs.rm(out, { recursive: true, force: true }))
  let active = 0
  let maximum = 0
  let captures = 0
  const bridge = new RenderBridge({ bot: bot(), agentId: 'pilot', outputDir: out, wait: async () => {}, renderer: {
    isConnected: () => true,
    call: async method => {
      if (method === 'render/status') return { ok: true, data: { ready: true, targetUuid: uuid, agentId: 'pilot' } }
      active++
      maximum = Math.max(maximum, active)
      await new Promise(resolve => setImmediate(resolve))
      active--
      captures++
      const item = frame()
      item.frameId = `${String(captures).padStart(8, '0')}-bbbb-cccc-dddd-eeeeeeeeeeee`
      return { ok: true, data: item }
    },
  } })
  const results = await Promise.all([bridge.capture(), bridge.capture()])
  assert.equal(maximum, 1)
  assert.equal((await fs.readdir(out)).length, 6)
  const metadata = JSON.parse(await fs.readFile(path.join(out, results[0].metadataFile), 'utf8'))
  assert.equal(metadata.depth.base64, undefined)
  assert.equal(metadata.cameraUuid, uuid)
  assert.equal((await fs.readFile(path.join(out, metadata.depth.file))).length, 16)
})

test('offline and wrong-target captures are rejected before writing files', async t => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'stevex-render-reject-'))
  t.after(() => fs.rm(out, { recursive: true, force: true }))
  const options = { bot: bot(), agentId: 'pilot', outputDir: out, renderer: {
    isConnected: () => true,
    call: async () => ({ ok: true, data: { ready: true, targetUuid: 'other', agentId: 'pilot' } }),
  } }
  await assert.rejects(new RenderBridge({ ...options, isOnline: () => false }).capture(), /offline/)
  await assert.rejects(new RenderBridge(options).capture(), /another player/)
  assert.deepEqual(await fs.readdir(out), [])
})

test('player motion during a capture invalidates the frame', async t => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'stevex-render-motion-'))
  t.after(() => fs.rm(out, { recursive: true, force: true }))
  const player = bot()
  const bridge = new RenderBridge({ bot: player, agentId: 'pilot', outputDir: out, wait: async () => {}, renderer: {
    isConnected: () => true,
    call: async method => {
      if (method === 'render/status') return { ok: true, data: { ready: true, targetUuid: uuid, agentId: 'pilot' } }
      player.entity.position.x += 1
      return { ok: true, data: frame() }
    },
  } })
  await assert.rejects(bridge.capture(), /moved/)
  assert.deepEqual(await fs.readdir(out), [])
})

test('closing stops movement and prevents queued actions from starting', async () => {
  let release
  let started
  const start = new Promise(resolve => { started = resolve })
  const controls = []
  const player = { ...bot(), setControlState: control => controls.push(control), clearControlStates: () => controls.push('clear') }
  const bridge = new RenderBridge({ bot: player, renderer: {}, agentId: 'pilot', outputDir: os.tmpdir(), wait: () => {
    started()
    return new Promise(resolve => { release = resolve })
  } })
  const moving = bridge.action({ type: 'move', control: 'forward', durationMs: 100 })
  await start
  const queued = bridge.action({ type: 'move', control: 'back', durationMs: 100 })
  const rejected = assert.rejects(queued, /closed/)
  bridge.close()
  release()
  await moving
  await rejected
  await assert.rejects(bridge.capture(), /closed/)
  assert.deepEqual(controls, ['forward', 'clear', 'clear'])
})

test('an idle renderer owns warmup instead of Node waiting for idle frames', async t => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'stevex-render-demand-'))
  t.after(() => fs.rm(out, { recursive: true, force: true }))
  const calls = []
  const bridge = new RenderBridge({ bot: bot(), agentId: 'pilot', outputDir: out, wait: async () => {}, renderer: {
    isConnected: () => true,
    call: async method => {
      calls.push(method)
      if (method === 'render/status') return { ok: true, data: { ready: false, targetUuid: null } }
      if (method === 'render/bind') return { ok: true, data: { ok: true, binding: true } }
      return { ok: true, data: frame() }
    },
  } })
  await bridge.capture()
  assert.deepEqual(calls, ['render/status', 'render/bind', 'render/capture'])
})
