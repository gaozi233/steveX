const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const { loadConfig } = require('../src/utils/config')
const { resolveAgentMemory } = require('../src/nbt/agent_memory')

async function prepareMemoryDebug(config, name, { liveFeedback = false } = {}) {
  if (!config.renderer?.enabled) throw new Error('Renderer is disabled in the selected config')
  const agent = (config.agents || []).find(entry => entry.name === name)
  if (!agent) throw new Error('Agent not found in the selected config')
  const memory = await resolveAgentMemory({ memoryNamespace: config.renderer.memoryNamespace,
    agentId: agent.renderer?.agentId || name, gameDir: config.renderer.gameDir })
  const gameDir = path.resolve(__dirname, '../runs/memory-debug', randomUUID())
  const snapshot = path.join(gameDir, 'snapshot')
  await fs.mkdir(gameDir, { recursive: true })
  // Snapshot-only debugging: never write feedback into the live renderer's memory.
  if (!liveFeedback) await fs.mkdir(snapshot)
  const sources = new Set(['owner.properties', 'terrain.nbt', 'entities.nbt', 'entities_union.nbt',
    'block_entities', 'containers', 'biomes', 'terrain_union'])
  for (const entry of liveFeedback ? [] : await fs.readdir(memory.visionRoot, { withFileTypes: true })) {
    if (sources.has(entry.name) && !entry.isSymbolicLink()) {
      await fs.cp(path.join(memory.visionRoot, entry.name), path.join(snapshot, entry.name), { recursive: true })
    }
  }
  const source = liveFeedback ? memory.visionRoot : snapshot
  const feedback = liveFeedback ? memory.visionRoot : path.join(gameDir, 'feedback')
  const ownerFile = path.join(memory.visionRoot, 'owner.properties')
  const settings = {
    worldName: 'MemoryDebug', autoOpenOnLaunch: true, resetOnLaunch: false, snapshotDebug: true,
    sourceFile: path.join(source, 'block_entities'), terrainFile: path.join(source, 'terrain.nbt'),
    entityFile: path.join(source, 'entities.nbt'), containerFile: path.join(source, 'containers'),
    biomeFile: path.join(source, 'biomes'), memoryCellsFile: path.join(feedback, 'memory_cells.bin'),
    memorySpritesFile: path.join(feedback, 'memory_sprites.bin'), removalEnabled: liveFeedback,
    sourceOwnerFile: liveFeedback ? ownerFile : '',
    sourceOwnerSha256: liveFeedback ? createHash('sha256').update(await fs.readFile(ownerFile)).digest('hex') : '',
    pollIntervalTicks: liveFeedback ? 1 : 20
  }
  const configDir = path.join(gameDir, 'config/stevex-test')
  await fs.mkdir(configDir, { recursive: true })
  await fs.copyFile(path.resolve(__dirname, '../configs/render-options.txt'), path.join(gameDir, 'options.txt'))
  await fs.writeFile(path.join(configDir, 'memory.json'), JSON.stringify(settings, null, 2))
  await fs.writeFile(path.join(gameDir, 'source.json'), JSON.stringify({ ...memory,
    preparedAt: new Date().toISOString(), mode: liveFeedback ? 'live-feedback' : 'snapshot', snapshotAtomic: false }, null, 2))
  return { gameDir, snapshot: liveFeedback ? null : snapshot, feedbackRoot: feedback,
    liveFeedback, agentId: memory.agentId, memoryNamespace: memory.memoryNamespace }
}

if (require.main === module) {
  prepareMemoryDebug(loadConfig(), process.argv[2], { liveFeedback: process.argv.includes('--live-feedback') }).then(result => {
    console.log(JSON.stringify(result))
  }).catch(err => { console.error(err.message); process.exitCode = 1 })
}

module.exports = { prepareMemoryDebug }
