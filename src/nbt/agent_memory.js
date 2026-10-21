const fs = require('node:fs/promises')
const path = require('node:path')
const { createNbtQueryApi, QueryError } = require('./index')

const PROJECT_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_GAME_DIR = path.join(PROJECT_ROOT, 'vendor/stevex-template-1.21.11/run-renderer')

function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) {
    throw new QueryError('LOAD_ERROR', 'Invalid memory namespace or agentId')
  }
  return value
}

async function resolveAgentMemory({ memoryNamespace, agentId, gameDir = DEFAULT_GAME_DIR }) {
  identifier(memoryNamespace)
  identifier(agentId)
  const visionRoot = path.resolve(gameDir, 'stevex/render/agents', memoryNamespace, agentId)
  let raw
  try { raw = await fs.readFile(path.join(visionRoot, 'owner.properties'), 'utf8') }
  catch (cause) { throw new QueryError('SOURCE_MISSING', 'No captured memory for this agent', { cause }) }
  // These three values are ASCII identifiers written by MemoryPaths, not arbitrary properties.
  const property = key => raw.match(new RegExp(`^${key}=([^\\r\\n]*)`, 'm'))?.[1]
  if (property('namespace') !== memoryNamespace || property('agentId') !== agentId ||
      !/^[0-9a-f-]{36}$/i.test(property('uuid') || '')) {
    throw new QueryError('SOURCE_CORRUPT', 'Memory owner does not match the selected agent')
  }
  return { memoryNamespace, agentId, uuid: property('uuid'), visionRoot }
}

async function createAgentNbtApi(options) {
  const memory = await resolveAgentMemory(options)
  return { ...createNbtQueryApi({ visionRoot: memory.visionRoot }), memory }
}

module.exports = { resolveAgentMemory, createAgentNbtApi, DEFAULT_GAME_DIR }
