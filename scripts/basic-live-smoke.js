const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')

// Connects to an existing local agent only. Never creates a world or uses admin commands.
const base = 'http://127.0.0.1:8090/api/agents/manual-test'
const actions = process.argv.includes('--actions')
const records = []
const out = path.resolve('runs/manual-observation', `basic-${Date.now()}.json`)
async function request(route, command) {
  const response = await fetch(base + route, command === undefined ? { signal: AbortSignal.timeout(5000) } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }), signal: AbortSignal.timeout(10000)
  })
  return response.json()
}
async function state() { const s = await request('/state'); assert.equal(s.ok, true); return s }
async function command(text) {
  const start = Date.now(), result = await request('/command', text)
  records.push({ at: new Date().toISOString(), command: text, elapsedMs: Date.now() - start, result })
  console.log(text, JSON.stringify(result))
  return result
}
function safeGround(s) {
  const safe = new Set(['air', 'cave_air', 'void_air', 'short_grass', 'tall_grass', 'fern'])
  return s.motion?.onGround && !s.motion.inWater && !s.motion.inLava && s.localTerrain?.length === 9 && s.localTerrain.every(c =>
    c.below?.boundingBox === 'block' && c.below.shapes?.some(shape => JSON.stringify(shape) === '[0,0,0,1,1,1]') &&
    !/magma|cactus|campfire|fire|wither|powder_snow/.test(c.below.name) && [c.feet, c.head, c.overhead].every(b => b && safe.has(b.name)))
}
function idle(s) { assert.equal(Object.keys(s.controls || {}).length, 7); assert.ok(Object.values(s.controls).every(v => v === false), 'movement controls still held or unknown') }
function angleDistance(a, b) { return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) }
async function test(name, body) {
  console.log('TEST', name)
  const start = records.length
  try { const detail = await body(); records.push({ test: name, outcome: detail?.skipped ? 'SKIP' : 'PASS', detail }) }
  catch (error) { records.push({ test: name, outcome: 'FAIL', error: error.stack }); throw error }
  finally { await fs.mkdir(path.dirname(out), { recursive: true }); await fs.writeFile(out, JSON.stringify(records, null, 2)); console.log('Recorded', name, records.length - start, 'entries') }
}
async function announce(text) { assert.equal((await command('say [API-test] ' + text)).ok, true); await delay(3000) }
async function main() {
  records.push({ startedAt: new Date().toISOString(), mode: actions ? 'observed-basic-actions' : 'queries-only', initialState: await state(), humanObservation: 'pending user confirmation' })
  await test('state queries', async () => {
    for (const query of ['pos', 'hp', 'hunger', 'oxygen', 'inventory', 'nearby', 'nearby player', 'gamemode', 'xp', 'time', 'weather']) {
      const result = await command(query)
      assert.equal(result.ok, true)
      if (query.startsWith('nearby')) {
        assert.ok(Array.isArray(result.entities))
        assert.ok(result.entities.every(e => e.distance <= result.radius))
        assert.ok(result.entities.every((e, i) => i === 0 || e.distance >= result.entities[i - 1].distance))
      }
    }
    const s = await state()
    if (s.airSupplyTicks != null) assert.equal(s.oxygen, Math.max(0, Math.min(20, Math.round(s.airSupplyTicks / 15))))
    return s
  })
  if (!actions) return
  const original = await state()
  try {
    await test('invalid arguments have no motion side effects', async () => {
      const before = await state()
      for (const text of ['look Infinity 0', 'look 0 2', 'lookat 0 Infinity 0', 'move forward 100abc', 'move forward 0']) {
        assert.equal((await command(text)).ok, false)
      }
      const after = await state(); idle(after)
      assert.deepEqual(after.orientation, before.orientation)
    })
    await test('turn and look at a position', async () => {
      await announce('Turning, then looking east. No walking.')
      assert.equal((await command(`look ${original.orientation.yaw + Math.PI / 2} 0`)).ok, true)
      let s = await state()
      assert.ok(angleDistance(s.orientation.yaw, original.orientation.yaw + Math.PI / 2) < 0.02)
      await delay(3000)
      assert.equal((await command(`lookat ${s.position.x + 3} ${s.position.y + 1.62} ${s.position.z}`)).ok, true)
      s = await state()
      assert.ok(angleDistance(s.orientation.yaw, Math.PI * 1.5) < 0.02)
      return s.orientation
    })
    await test('arm swing', async () => {
      await announce('Swing right arm, then left arm.')
      assert.equal((await command('swing right')).ok, true); await delay(3000)
      assert.equal((await command('swing left')).ok, true)
      return { animation: 'requires human observation; command completion only' }
    })
    await test('single jump', async () => {
      const before = await state()
      if (!safeGround(before)) return { skipped: true, reason: 'Need a flat clear 3x3 area with three blocks of headroom' }
      await announce('One jump in place.')
      if (!safeGround(await state())) return { skipped: true, reason: 'Terrain changed before jump' }
      const samples = []
      const jumping = command('jump')
      for (let i = 0; i < 12; i++) { samples.push(await state()); await delay(80) }
      assert.equal((await jumping).ok, true)
      await delay(500)
      const after = await state(); idle(after)
      assert.ok(Math.max(...samples.map(s => s.position.y)) - before.position.y > 0.4, 'No jump height observed')
      assert.ok(Math.abs(after.position.y - before.position.y) < 0.1)
      assert.ok(after.health >= before.health)
      return { peakDeltaY: Math.max(...samples.map(s => s.position.y)) - before.position.y, after }
    })
    for (const direction of ['forward', 'back', 'left', 'right']) await test('short move ' + direction, async () => {
      if (!safeGround(await state())) return { skipped: true, reason: 'Unsafe/unknown surrounding terrain' }
      await announce('Short step ' + direction + ' (150 ms).')
      const before = await state()
      if (!safeGround(before)) return { skipped: true, reason: 'Terrain changed' }
      assert.equal((await command(`move ${direction} 150`)).ok, true)
      await delay(1200)
      const after = await state(); idle(after)
      const dx = after.position.x - before.position.x, dz = after.position.z - before.position.z
      assert.ok(Math.hypot(dx, dz) > 0.03 && Math.hypot(dx, dz) < 1.3, 'Unexpected displacement')
      assert.ok(after.health >= before.health); assert.ok(Math.abs(after.position.y - before.position.y) < 0.1)
      const yaw = before.orientation.yaw
      const forward = [-Math.sin(yaw), -Math.cos(yaw)], right = [Math.cos(yaw), -Math.sin(yaw)]
      const desired = direction === 'forward' ? forward : direction === 'back' ? forward.map(v => -v) : direction === 'right' ? right : right.map(v => -v)
      assert.ok((dx * desired[0] + dz * desired[1]) / Math.hypot(dx, dz) > 0.9, 'Movement direction disagrees with yaw')
      return { dx, dz, before: before.position, after: after.position }
    })
    await test('stop cancels a held sneak control', async () => {
      await announce('Sneak, then interrupt with stop. No walking.')
      const pending = command('move sneak 5000')
      await delay(350)
      assert.equal((await command('stop')).ok, true)
      const result = await pending
      assert.equal(result.cancelled, true); assert.equal(result.ok, false)
      assert.equal((await command('stand')).ok, true)
      idle(await state())
    })
  } finally {
    await command('stop')
    await command(`look ${original.orientation.yaw} ${original.orientation.pitch}`)
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await fs.mkdir(path.dirname(out), { recursive: true }); await fs.writeFile(out, JSON.stringify(records, null, 2)); console.log('Report:', out)
})
