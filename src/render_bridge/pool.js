const path = require('node:path')

class RenderQueue {
  constructor(limit = 32) {
    this.limit = limit
    this.pending = 0
    this.tail = Promise.resolve()
    this.closed = false
  }
  run(operation) {
    if (this.closed) return Promise.reject(new Error('Render queue is closed'))
    if (this.pending >= this.limit) return Promise.reject(new Error('Render queue is full'))
    this.pending++
    const next = this.tail.then(() => {
      if (this.closed) throw new Error('Render queue is closed')
      return operation()
    })
    this.tail = next.catch(() => {}).finally(() => { this.pending-- })
    return next
  }
  close() { this.closed = true }
}

function normalizeConfig(config) {
  const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
  const memoryNamespace = config.memoryNamespace || 'default'
  if (!identifier(memoryNamespace)) throw new Error('Invalid memoryNamespace')
  const definitions = config.agents || [{ id: config.agentId, minecraft: config.minecraft }]
  if (!Array.isArray(definitions) || !definitions.length || definitions.length > 32) throw new Error('agents requires 1..32 players')
  const ids = new Set()
  const usernames = new Set()
  let server
  const agents = definitions.map(item => {
    if (!identifier(item.id) || ids.has(item.id.toLowerCase())) throw new Error('Invalid or duplicate agent ID')
    ids.add(item.id.toLowerCase())
    const minecraft = { ...config.minecraft, ...item.minecraft }
    if (item.username) minecraft.username = item.username
    if (typeof minecraft.username !== 'string' || !/^[A-Za-z0-9_]{1,16}$/.test(minecraft.username)
        || minecraft.username.toLowerCase() === 'stevexrenderer'
        || usernames.has(minecraft.username.toLowerCase())) throw new Error('Invalid or duplicate Minecraft username (renderer account is reserved)')
    usernames.add(minecraft.username.toLowerCase())
    const address = JSON.stringify([minecraft.host || 'localhost', minecraft.port || 25565, minecraft.version])
    if (server && server !== address) throw new Error('All players must use the same Minecraft server/version')
    server = address
    return { id: item.id, minecraft, outputDir: path.resolve(config.outputDir || 'runs/render-bridge', memoryNamespace, item.id) }
  })
  return { memoryNamespace, agents }
}

module.exports = { RenderQueue, normalizeConfig }
