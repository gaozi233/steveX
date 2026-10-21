const fs = require('node:fs')
const path = require('node:path')
const express = require('express')
const mineflayer = require('mineflayer')
const { ModWSClient } = require('../mod/client')
const { RenderBridge, poseOf } = require('./bridge')
const { RenderQueue, normalizeConfig } = require('./pool')

const configPath = path.resolve(process.argv[2] || 'configs/render-bridge.example.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const { memoryNamespace, agents: definitions } = normalizeConfig(config)
const address = new URL(config.rendererUrl)
if (address.protocol !== 'ws:' || !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)) throw new Error('Renderer must use a loopback WebSocket')
const renderer = new ModWSClient({ url: config.rendererUrl, requestTimeoutMs: 60000 })
const renderQueue = new RenderQueue()
const agents = new Map()
for (const definition of definitions) {
  const bot = mineflayer.createBot(definition.minecraft)
  const entry = { ...definition, bot, online: false, lastError: null }
  // Same 1.21.11 knockback correction as main: lpVec3 is already blocks/tick.
  bot._client.on('entity_velocity', packet => {
    if (bot.version !== '1.21.11' || !packet.velocity) return
    bot.entities[packet.entityId]?.velocity?.set(packet.velocity.x, packet.velocity.y, packet.velocity.z)
  })
  bot.on('spawn', () => { entry.online = true; entry.lastError = null; console.log(`[render-bridge] spawned ${entry.id}: ${bot.username}`) })
  bot.on('end', () => { entry.online = false })
  bot.on('error', error => { entry.lastError = error.message; console.error(`[render-bridge] ${entry.id}: ${error.message}`) })
  bot.on('kicked', () => { entry.online = false; entry.lastError = 'Player was kicked; inspect server logs' })
  entry.bridge = new RenderBridge({ bot, renderer, agentId: entry.id, memoryNamespace, renderQueue,
    allowSwitch: true, outputDir: entry.outputDir, isOnline: () => entry.online })
  agents.set(entry.id, entry)
}
renderer.connect()
const app = express()
app.use(express.json({ limit: '8kb' }))
const agentStatus = entry => ({ agentId: entry.id, online: entry.online, lastError: entry.lastError,
  pose: entry.online ? poseOf(entry.bot) : null })
function select(req) {
  const id = req.params.agentId || req.body?.agentId || (agents.size === 1 ? agents.keys().next().value : null)
  if (!agents.has(id)) throw new Error('Provide a configured agentId; use /agents/:agentId/capture or /action')
  return agents.get(id)
}
app.get('/status', async (req, res) => {
  let rendererState = null
  if (renderer.isConnected()) {
    const result = await renderer.call('render/status')
    rendererState = result.ok ? result.data : { ok: false, error: result.error }
  }
  const statuses = [...agents.values()].map(agentStatus)
  res.json({ ...(agents.size === 1 ? statuses[0] : {}), memoryNamespace, agents: statuses,
    rendererConnected: renderer.isConnected(), rendererState, renderQueuePending: renderQueue.pending })
})
app.get('/agents/:agentId/status', (req, res) => res.json(agentStatus(select(req))))
const capture = async (req, res) => res.json({ ok: true, frame: await select(req).bridge.capture() })
const action = async (req, res) => res.json({ ok: true, pose: await select(req).bridge.action(req.body) })
app.post('/capture', capture)
app.post('/agents/:agentId/capture', capture)
app.post('/action', action)
app.post('/agents/:agentId/action', action)
app.post('/agents/:agentId/stop', (req, res) => { select(req).bridge.stop(); res.json({ ok: true }) })
app.post('/stop', (req, res) => { for (const entry of agents.values()) entry.bridge.stop(); res.json({ ok: true }) })
for (const entry of agents.values()) {
  app.use(`/agents/${entry.id}/artifacts`, express.static(entry.outputDir, { dotfiles: 'deny', index: false }))
}
if (agents.size === 1) app.use('/artifacts', express.static(definitions[0].outputDir, { dotfiles: 'deny', index: false }))
app.use((error, req, res, next) => res.status(400).json({ ok: false, error: error.message }))
const server = app.listen(config.httpPort || 8091, '127.0.0.1', () => console.log(`[render-bridge] ${agents.size} players share one renderer; http://127.0.0.1:${server.address().port}`))
let closing = false
function shutdown() {
  if (closing) return
  closing = true
  for (const entry of agents.values()) entry.bridge.close()
  renderQueue.close()
  Promise.all([...agents.values()].map(entry => entry.bridge.tail)).then(async () => {
    await renderQueue.tail
    if (renderer.isConnected()) await renderer.call('render/unbind')
    renderer.close()
    for (const entry of agents.values()) entry.bot.quit()
    server.close()
  }).catch(error => { console.error(error.message); process.exitCode = 1 })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
