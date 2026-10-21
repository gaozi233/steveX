const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { RenderQueue, normalizeConfig } = require('../../src/render_bridge/pool')
const { RenderBridge, poseOf } = require('../../src/render_bridge/bridge')

test('pool config isolates paths and rejects traversal, aliases and different servers', () => {
  const config = { memoryNamespace: 'world1', minecraft: { host: 'localhost', version: '1.21.11' }, agents: [
    { id: 'a', username: 'BotA' }, { id: 'b', username: 'BotB' },
  ] }
  const { agents } = normalizeConfig(config)
  assert.notEqual(agents[0].outputDir, agents[1].outputDir)
  assert.throws(() => normalizeConfig({ ...config, memoryNamespace: '../bad' }), /namespace/i)
  assert.throws(() => normalizeConfig({ ...config, agents: [{ id: 'a', username: 'SteveXRenderer' }] }), /reserved/)
  assert.throws(() => normalizeConfig({ ...config, agents: [config.agents[0], { id: 'A', username: 'BotC' }] }), /duplicate/)
  assert.throws(() => normalizeConfig({ ...config, agents: [config.agents[0], { id: 'b', username: 'bota' }] }), /duplicate/)
  assert.throws(() => normalizeConfig({ ...config, agents: [config.agents[0], { id: 'b', username: 'BotB', minecraft: { port: 25566 } }] }), /same Minecraft/)
})

test('shared render queue covers binding, capture and per-agent output writes', async t => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'stevex-pool-'))
  t.after(() => fs.rm(out, { recursive: true, force: true }))
  const queue = new RenderQueue()
  let selected = {}
  const order = []
  let count = 0
  const players = new Map()
  const renderer = {
    isConnected: () => true,
    call: async (method, identity) => {
      if (method === 'render/status') return { ok: true, data: selected }
      if (method === 'render/bind') { selected = { ...identity }; order.push(identity.agentId); return { ok: true, data: { ok: true } } }
      const before = { ...selected }
      await new Promise(resolve => setTimeout(resolve, 5))
      assert.deepEqual(selected, before)
      assert.deepEqual(identity, selected)
      const pose = poseOf(players.get(identity.agentId))
      const png = Buffer.alloc(24)
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
      png.writeUInt32BE(1, 16)
      png.writeUInt32BE(1, 20)
      return { ok: true, data: { ok: true, ...identity, cameraUuid: identity.targetUuid,
        frameId: `${String(++count).padStart(8, '0')}-bbbb-cccc-dddd-eeeeeeeeeeee`,
        dimension: 'overworld', width: 1, height: 1,
        camera: { position: [pose.feet[0], 65.62, 0], yawDegrees: pose.yawDegrees, pitchDegrees: 0 },
        rgb: { base64: png.toString('base64') },
        depth: { encoding: 'float32-le-base64', origin: 'top-left', base64: Buffer.alloc(4).toString('base64') },
      } }
    },
  }
  const bridges = ['a', 'b'].map((id, i) => {
    const bot = { entity: { uuid: `00000000-0000-0000-0000-00000000000${i}`, position: { x: i * 100, y: 64, z: 0 }, yaw: Math.PI, pitch: 0 }, game: { dimension: 'overworld' } }
    players.set(id, bot)
    return new RenderBridge({ bot, renderer, agentId: id, memoryNamespace: 'world1', renderQueue: queue,
      allowSwitch: true, outputDir: path.join(out, id), wait: async () => {} })
  })
  const frames = await Promise.all([bridges[0].capture(), bridges[1].capture(), bridges[0].capture()])
  assert.deepEqual(order, ['a', 'b', 'a'])
  assert.equal((await fs.readdir(path.join(out, 'a'))).length, 6)
  assert.equal((await fs.readdir(path.join(out, 'b'))).length, 3)
  assert.deepEqual(frames.map(frame => frame.agentId), ['a', 'b', 'a'])
})

test('queue backpressure and failures do not strand future captures', async () => {
  const queue = new RenderQueue(1)
  let release
  const first = queue.run(() => new Promise(resolve => { release = resolve }))
  await Promise.resolve()
  await assert.rejects(queue.run(() => {}), /full/)
  release()
  await first
  await queue.tail
  await assert.rejects(queue.run(() => { throw new Error('failed') }), /failed/)
  await queue.tail
  assert.equal(await queue.run(() => 'recovered'), 'recovered')
  queue.close()
  await assert.rejects(queue.run(() => {}), /closed/)
})
