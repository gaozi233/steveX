const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const root = path.resolve(__dirname, '../runs/api-acceptance-server')
const password = fs.readFileSync(path.join(root, 'server.properties'), 'utf8').match(/^rcon.password=(.*)$/m)[1].trim()
const base = 'http://127.0.0.1:8090/api/agents/manual-test'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const log = { startedAt: new Date().toISOString(), records: [], humanObservation: 'pending', protocol: 'server RCON coordinates and HTTP state; no human input automation' }
const out = path.join(root, `terrain-${Date.now()}.json`)
function save() { fs.writeFileSync(out, JSON.stringify(log, null, 2)) }
function rcon(command) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 25575 })
    let buffer = Buffer.alloc(0), text = ''
    function send(id, type, value) {
      const body = Buffer.from(value), packet = Buffer.alloc(body.length + 14)
      packet.writeInt32LE(body.length + 10); packet.writeInt32LE(id, 4); packet.writeInt32LE(type, 8); body.copy(packet, 12); socket.write(packet)
    }
    socket.setTimeout(10000, () => socket.destroy(new Error('RCON timeout')))
    socket.on('error', reject)
    socket.on('connect', () => send(1, 3, password))
    socket.on('data', data => {
      buffer = Buffer.concat([buffer, data])
      while (buffer.length >= 4 && buffer.length >= buffer.readInt32LE(0) + 4) {
        const size = buffer.readInt32LE(0) + 4, message = buffer.subarray(0, size)
        buffer = buffer.subarray(size)
        const id = message.readInt32LE(4), type = message.readInt32LE(8)
        if (id === -1) return socket.destroy(new Error('RCON auth failed'))
        if (id === 1 && type === 2) send(2, 2, command)
        if (id === 2) { text += message.toString('utf8', 12, size - 2); socket.end(); resolve(text) }
      }
    })
  })
}
async function http(route, command) {
  const response = await fetch(base + route, command === undefined ? { signal: AbortSignal.timeout(5000) } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }), signal: AbortSignal.timeout(20000)
  })
  return response.json()
}
async function server(command) {
  const response = await rcon(command)
  log.records.push({ command, response, at: new Date().toISOString() }); save()
  return response
}
const lanes = [
  { name: 'flat', z: 0, goal: [112, -60, 0] },
  { name: 'slab', z: 8, goal: [112, -60, 8] },
  { name: 'stairs', z: 16, goal: [112, -57, 16] },
  { name: 'water-with-flow', z: 24, goal: [112, -60, 24] },
  { name: 'water-against-flow', z: 32, goal: [112, -60, 32] },
  { name: 'bubble-up', z: 40, goal: [106, -54, 40] },
  { name: 'bubble-down', z: 48, goal: [106, -60, 48] }
]
async function build() {
  // Only touches the reserved arena x=98..117, z=-2..50 of this disposable world.
  for (const lane of lanes) {
    const z = lane.z
    await server(`fill 98 -60 ${z - 2} 117 -51 ${z + 2} air`)
    await server(`fill 98 -61 ${z - 2} 117 -61 ${z + 2} smooth_stone`)
    for (const edge of [z - 2, z + 2]) await server(`fill 98 -60 ${edge} 117 -53 ${edge} glass`)
    await server(`setblock 100 -61 ${z} gold_block`)
    await server(`setblock 112 -61 ${z} emerald_block`)
    if (lane.name === 'slab') await server(`fill 104 -60 ${z - 1} 107 -60 ${z + 1} stone_slab[type=bottom]`)
    if (lane.name === 'stairs') {
      for (let i = 0; i < 3; i++) {
        if (i) await server(`fill ${104 + i} -60 ${z - 1} ${104 + i} ${-60 + i - 1} ${z + 1} smooth_stone`)
        await server(`fill ${104 + i} ${-60 + i} ${z - 1} ${104 + i} ${-60 + i} ${z + 1} stone_stairs[facing=east,half=bottom,shape=straight]`)
      }
      await server(`fill 107 -60 ${z - 1} 115 -58 ${z + 1} smooth_stone`)
      await server(`setblock 112 -58 ${z} emerald_block`)
    }
    if (lane.name.startsWith('water-')) {
      const source = lane.name === 'water-with-flow' ? 100 : 112
      const back = lane.name === 'water-with-flow' ? 99 : 113
      await server(`fill ${back} -60 ${z - 1} ${back} -59 ${z + 1} glass`)
      await server(`fill ${source} -60 ${z - 1} ${source} -60 ${z + 1} water[level=0]`)
    }
    if (lane.name.startsWith('bubble-')) {
      for (const x of [104, 108]) await server(`fill ${x} -60 ${z - 1} ${x} -54 ${z + 1} glass`)
      await server(`fill 105 -60 ${z - 1} 107 -54 ${z + 1} water[level=0]`)
      await server(`fill 105 -61 ${z - 1} 107 -61 ${z + 1} ${lane.name === 'bubble-up' ? 'soul_sand' : 'magma_block'}`)
      // Entry gap at the base; retain full source-water column above it.
      await server(`fill 104 -60 ${z - 1} 104 -59 ${z + 1} water[level=0]`)
    }
  }
  await server('tp piggy985 96.5 -60.0 8.5 -90 0')
  await server('tellraw @a {"text":"[API test] Arena x=100..115, lanes z=0 flat,8 slab,16 stairs,24/32 water,40/48 bubbles. Bot tests start shortly.","color":"yellow"}')
  await delay(3000)
}
async function sample() {
  const state = await http('/state')
  const serverPos = await rcon('data get entity SteveX-Test Pos')
  const humanPos = await rcon('data get entity piggy985 Pos')
  return { at: new Date().toISOString(), position: state.position, motion: state.motion, controls: state.controls,
    health: state.health, serverPos, humanPos, dimension: state.dimension }
}
async function trial(lane, action) {
  await http('/command', 'stop')
  const x = lane.name.startsWith('bubble-') ? 106.5 : action === 'jump' && lane.name === 'slab' ? 105.5 : action === 'jump' && lane.name === 'stairs' ? 105.25 : action === 'jump' && lane.name === 'water-with-flow' ? 102.5 : action === 'jump' && lane.name === 'water-against-flow' ? 110.5 : 100.5
  const y = lane.name.startsWith('bubble-') ? (lane.name === 'bubble-down' ? -54 : -60) : action === 'jump' && lane.name === 'slab' ? -59.5 : action === 'jump' && lane.name === 'stairs' ? -58.5 : -60
  await server(`tellraw @a {"text":"[API test] ${lane.name}: ${action}","color":"aqua"}`)
  await delay(1500)
  await server(`tp SteveX-Test ${x.toFixed(3)} ${y.toFixed(3)} ${(lane.z + 0.5).toFixed(3)} -90 0`)
  await delay(lane.name.startsWith('bubble-') ? 50 : 800)
  const record = { lane: lane.name, action, startedAt: new Date().toISOString(), samples: [await sample()] }
  log.records.push(record); save()
  const command = action === 'goto' ? `goto ${lane.goal.join(' ')}` : action === 'move' ? 'move forward 2500' : 'jump'
  record.command = command
  let done = false
  const operation = http('/command', command).then(result => { record.result = result }).catch(error => { record.error = error.message }).finally(() => { done = true })
  const start = Date.now()
  while (!done && Date.now() - start < 12000) { await delay(300); record.samples.push(await sample()); save() }
  if (!done) { record.watchdog = '12s stop; not an API completion'; await http('/command', 'stop') }
  await operation
  await delay(action === 'jump' ? 1700 : 500)
  record.samples.push(await sample())
  record.elapsedMs = Date.now() - start
  const a = record.samples[0].position, b = record.samples.at(-1).position
  record.displacement = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  record.maxY = Math.max(...record.samples.map(s => s.position.y))
  record.humanVerdict = 'pending'
  save(); console.log(lane.name, action, JSON.stringify({ result: record.result, displacement: record.displacement, maxY: record.maxY, watchdog: record.watchdog }))
}
async function main() {
  if (!process.argv.includes('--live')) throw new Error('Explicit --live is required; this script teleports the test bot and --build modifies the reserved arena')
  const selected = process.argv.find(arg => arg.startsWith('--lane='))?.slice(7)
  if (selected && !lanes.some(l => l.name === selected)) throw new Error('Unknown lane')
  const selectedAction = process.argv.find(arg => arg.startsWith('--action='))?.slice(9)
  if (selectedAction && !['move', 'jump', 'goto'].includes(selectedAction)) throw new Error('Unknown action')
  const lock = path.join(root, 'terrain-live.lock')
  const handle = fs.openSync(lock, 'wx')
  try {
    log.original = await sample(); save()
    if (process.argv.includes('--build')) await build()
    if (process.argv.includes('--build-only')) return
    for (const lane of lanes.filter(l => !selected || l.name === selected)) {
      for (const action of ['move', 'jump', 'goto'].filter(a => !selectedAction || a === selectedAction)) await trial(lane, action)
    }
  } finally {
    try { await http('/command', 'stop') }
    finally {
      fs.closeSync(handle); fs.unlinkSync(lock)
      log.finishedAt = new Date().toISOString(); save(); console.log('LOG', out)
    }
  }
}
if (require.main === module && !process.env.NODE_TEST_CONTEXT) {
  main().catch(error => { log.error = error.stack; save(); console.error(error); process.exitCode = 1 })
}
