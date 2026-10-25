const path = require('node:path')
const { ModWSClient } = require('../mod/client')
const { RenderQueue } = require('./pool')
const { RenderBridge } = require('./bridge')

class SharedRenderService {
  constructor(config, agentConfigs, renderer = null) {
    const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
    if (!id(config.memoryNamespace)) throw new Error('renderer.memoryNamespace is required (ASCII letters, digits, _ and -)')
    const url = new URL(config.url || 'ws://127.0.0.1:25550')
    if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Renderer must use a loopback WebSocket')
    this.config = config
    this.ids = new Map()
    const used = new Set()
    let server
    for (const entry of agentConfigs) {
      const key = entry.renderer?.agentId || entry.name
      if (!id(key) || used.has(key.toLowerCase())) throw new Error('Renderer agent IDs must be valid and unique')
      if (entry.minecraft.version !== '1.21.11' || entry.minecraft.username.toLowerCase() === 'stevexrenderer') throw new Error('Renderer requires 1.21.11 players and its own account')
      const address = JSON.stringify([entry.minecraft.host, entry.minecraft.port || 25565])
      if (server && server !== address) throw new Error('Shared renderer players must use the same server')
      server = address
      used.add(key.toLowerCase())
      this.ids.set(entry.name, key)
    }
    if (used.size > 32) throw new Error('Renderer supports at most 32 memory contexts')
    this.timeoutMs = config.captureTimeoutMs || 60000
    this.renderer = renderer || new ModWSClient({ url: url.toString(), requestTimeoutMs: 45000 })
    this.queue = new RenderQueue()
    this.bridges = new WeakMap()
    this.closed = false
  }

  connect() { this.renderer.connect() }

  capture(agent, signal, perspective = 'first-person') {
    if (this.closed) return Promise.reject(new Error('Renderer service is closed'))
    let bridge = this.bridges.get(agent)
    if (!bridge) {
      const agentId = this.ids.get(agent.name)
      if (!agentId) return Promise.reject(new Error('Agent is not registered for rendering'))
      bridge = new RenderBridge({ bot: agent.bot, renderer: this.renderer, agentId,
        memoryNamespace: this.config.memoryNamespace, outputDir: path.resolve(this.config.outputDir || 'runs/observations', this.config.memoryNamespace, agentId),
        isOnline: () => agent.isOnline() })
      this.bridges.set(agent, bridge)
    }
    return this.queue.run(() => bridge.captureFrame({ signal, perspective }))
  }

  async status() {
    const result = this.renderer.isConnected() ? await this.renderer.call('render/status') : null
    return { enabled: true, connected: this.renderer.isConnected(), pending: this.queue.pending,
      memoryNamespace: this.config.memoryNamespace, state: result?.ok ? result.data : null, error: result && !result.ok ? result.error : null }
  }

  async queryNbt(name, params) {
    if (this.closed) throw new Error('Renderer service is closed')
    const agentId = this.ids.get(name)
    if (!agentId) throw new Error('Agent is not registered for rendering')
    const { createAgentNbtApi } = require('../nbt/agent_memory')
    const api = await createAgentNbtApi({ memoryNamespace: this.config.memoryNamespace,
      agentId, gameDir: this.config.gameDir })
    try {
      return { ...await api.query(params), agentId, memoryNamespace: this.config.memoryNamespace,
        uuid: api.memory.uuid, source: 'captured-client-nbt' }
    } finally { api.clearCache() }
  }

  async close() {
    if(this.closeWork)return this.closeWork
    this.closed = true
    this.queue.close()
    // Draining captures keeps the physical-settlement barrier. Only the final
    // best-effort unbind has a short budget, with transport cleanup in finally.
    this.closeWork=(async()=>{
      await this.queue.tail
      let timer
      try{
        if(this.renderer.isConnected())await Promise.race([
          this.renderer.call('render/unbind',{}, {timeoutMs:1000}),
          new Promise(resolve=>{timer=setTimeout(resolve,1000)})])
      }finally{clearTimeout(timer);this.renderer.close()}
    })()
    return this.closeWork
  }
}

module.exports = { SharedRenderService }
