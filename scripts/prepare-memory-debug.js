const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { loadConfig } = require('../src/utils/config')
const { resolveAgentMemory } = require('../src/nbt/agent_memory')

async function prepareMemoryDebug(config, name) {
  if (!config.renderer?.enabled) throw new Error('Renderer is disabled in the selected config')
  const agent = (config.agents || []).find(entry => entry.name === name)
  if (!agent) throw new Error('Agent not found in the selected config')
  const memory = await resolveAgentMemory({ memoryNamespace: config.renderer.memoryNamespace,
    agentId: agent.renderer?.agentId || name, gameDir: config.renderer.gameDir })
  const gameDir = path.resolve(__dirname, '../runs/memory-debug', randomUUID())
  const snapshot = path.join(gameDir, 'snapshot')
  await fs.mkdir(gameDir, { recursive: true })
  // Snapshot-only debugging: never write feedback into the live renderer's memory.
  await fs.mkdir(snapshot)
  const sources = new Set(['owner.properties', 'terrain.nbt', 'entities.nbt', 'entities_union.nbt',
    'block_entities', 'containers', 'biomes', 'terrain_union'])
  for (const entry of await fs.readdir(memory.visionRoot, { withFileTypes: true })) {
    if (sources.has(entry.name) && !entry.isSymbolicLink()) {
      await fs.cp(path.join(memory.visionRoot, entry.name), path.join(snapshot, entry.name), { recursive: true })
    }
  }
  const feedback = path.join(gameDir, 'feedback')
  const settings = {
    worldName: 'MemoryDebug', autoOpenOnLaunch: true, resetOnLaunch: false, snapshotDebug: true,
    sourceFile: path.join(snapshot, 'block_entities'), terrainFile: path.join(snapshot, 'terrain.nbt'),
    entityFile: path.join(snapshot, 'entities.nbt'), containerFile: path.join(snapshot, 'containers'),
    biomeFile: path.join(snapshot, 'biomes'), memoryCellsFile: path.join(feedback, 'memory_cells.bin'),
    memorySpritesFile: path.join(feedback, 'memory_sprites.bin'), removalEnabled: false,
    pollIntervalTicks: 20
  }
  const configDir = path.join(gameDir, 'config/stevex-test')
  await fs.mkdir(configDir, { recursive: true })
  await fs.copyFile(path.resolve(__dirname, '../configs/render-options.txt'), path.join(gameDir, 'options.txt'))
  await fs.writeFile(path.join(configDir, 'memory.json'), JSON.stringify(settings, null, 2))
  await fs.writeFile(path.join(gameDir, 'source.json'), JSON.stringify({ ...memory,
    copiedAt: new Date().toISOString(), snapshotAtomic: false }, null, 2))
  return { gameDir, snapshot, agentId: memory.agentId, memoryNamespace: memory.memoryNamespace }
}

if (require.main === module) {
  prepareMemoryDebug(loadConfig(), process.argv[2]).then(result => {
    console.log(JSON.stringify(result))
  }).catch(err => { console.error(err.message); process.exitCode = 1 })
}

module.exports = { prepareMemoryDebug }
