const fs = require('node:fs/promises')
const path = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')

// Read-only observer. Immersion, rescue and server-side /data queries stay with the human host.
async function main() {
  const args = process.argv.slice(2)
  const seconds = args[0] === undefined ? 30 : Number(args[0])
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 120) throw Error('Duration must be 1..120 seconds')
  const clientLog = args[1] ? path.resolve(args[1]) : null
  const records = { startedAt: new Date().toISOString(), mode: 'read-only-human-controlled',
    serverOracleNote: 'Client log contains host-executed server /data results; log timestamps have second precision. No automatic equality claim.', samples: [], serverLog: [] }
  const out = path.resolve('runs/manual-observation', `oxygen-${Date.now()}.json`)
  const deadline = Date.now() + seconds * 1000
  try {
    while (Date.now() < deadline) {
      const response = await fetch('http://127.0.0.1:8090/api/agents/manual-test/state', { signal: AbortSignal.timeout(5000) })
      const state = await response.json()
      if (!state.ok) throw Error(state.error || 'Agent offline')
      const sample = { receivedAt: new Date().toISOString(), observedAt: state.observedAt, airSupplyTicks: state.airSupplyTicks,
        oxygen: state.oxygen, health: state.health, motion: state.motion, position: state.position }
      records.samples.push(sample)
      console.log(JSON.stringify(sample))
      if (state.health < 20 || (state.airSupplyTicks != null && state.airSupplyTicks < 80)) console.error('LOW AIR/HEALTH: human host should rescue the agent now')
      await delay(250)
    }
  } finally {
    if (clientLog) {
      try { records.serverLog = (await fs.readFile(clientLog, 'utf8')).split(/\r?\n/).filter(line =>
        /SteveX-Test has the following entity data: -?\d+s\b/.test(line)).slice(-100) }
      catch (error) { records.serverLogError = error.message }
    }
    records.finishedAt = new Date().toISOString()
    records.summary = { samples: records.samples.length,
      knownAirSamples: records.samples.filter(s => s.airSupplyTicks != null).length,
      scaleMismatches: records.samples.filter(s => s.airSupplyTicks != null && s.oxygen !== Math.max(0, Math.min(20, Math.round(s.airSupplyTicks / 15)))).length,
      minAir: records.samples.length ? Math.min(...records.samples.filter(s => s.airSupplyTicks != null).map(s => s.airSupplyTicks)) : null,
      minHealth: records.samples.length ? Math.min(...records.samples.map(s => s.health)) : null }
    if (!Number.isFinite(records.summary.minAir)) records.summary.minAir = null
    await fs.mkdir(path.dirname(out), { recursive: true })
    await fs.writeFile(out, JSON.stringify(records, null, 2))
    console.log('Report:', out, JSON.stringify(records.summary))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
