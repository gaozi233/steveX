const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')

function plain(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => typeof item === 'bigint' ? item.toString() : item))
}

function itemView(item) {
  if (!item) return null
  return plain({ name: item.name, type: item.type, count: item.count, metadata: item.metadata,
    components: item.components, nbt: item.nbt })
}

function safeId(value) {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : 'agent-' + createHash('sha256').update(String(value)).digest('hex').slice(0, 16)
}

class InteractionMemory {
  constructor({ agentName, agentId, memoryNamespace, sessionId, server, outputDir = 'runs/interaction-memory' }) {
    this.identity = { agentName, agentId, memoryNamespace, sessionId, server }
    this.file = path.resolve(outputDir, safeId(memoryNamespace), safeId(agentId), sessionId + '.json')
    this.records = new Map()
    this.tail = Promise.resolve()
    this.lastError = null
    this.restores = []
  }

  attach(bot) {
    this.bot = bot
    for (const [method, scope] of [['openBlock', 'block'], ['openEntity', 'entity']]) {
      const original = bot[method]
      if (typeof original !== 'function') continue
      const wrapper = async (...args) => {
        const target = args[0]
        const pending = { scope, dimension: bot.game?.dimension, target: scope === 'block'
          ? { block: target.name, pos: [target.position.x, target.position.y, target.position.z] }
          : { entityId: target.id, uuid: target.uuid, type: target.name } }
        this.pending = pending
        try { return await original.apply(bot, args) }
        finally { if (this.pending === pending) this.pending = null }
      }
      bot[method] = wrapper
      this.restores.push(() => { if (bot[method] === wrapper) bot[method] = original })
    }
    this.onOpen = window => {
      this.finishWindow()
      if (!window || !Number.isInteger(window.inventoryStart) || window.inventoryStart < 0
          || window.inventoryStart > window.slots.length) return
      // Uncorrelated server-opened windows remain unknown; never guess a world coordinate.
      this.context = plain(this.pending || { scope: 'unknown', dimension: bot.game?.dimension })
      this.window = window
      this.update = () => this.record()
      window.on('updateSlot', this.update)
      this.record()
    }
    this.onClose = window => { if (window === this.window) this.finishWindow() }
    bot.on('windowOpen', this.onOpen)
    bot.on('windowClose', this.onClose)
  }

  record() {
    if (!this.window) return
    const record = { ...this.context, windowType: this.window.type, windowId: this.window.id,
      layout: 'window-local', slotCount: this.window.inventoryStart,
      slots: this.window.slots.slice(0, this.window.inventoryStart).map(itemView),
      actorUuid: this.bot.entity?.uuid || this.bot.player?.uuid,
      observedAt: new Date().toISOString(), source: 'mineflayer-window', completeWindow: true }
    const key = JSON.stringify([record.dimension, record.scope, record.target || record.windowId])
    this.records.delete(key)
    this.records.set(key, record)
    if (this.records.size > 256) this.records.delete(this.records.keys().next().value)
    if (!this.saveTimer) this.saveTimer = setImmediate(() => { this.saveTimer = null; this.save() })
  }

  snapshot() {
    return plain({ ...this.identity, source: 'mineflayer-window', records: [...this.records.values()], lastError: this.lastError })
  }

  save() {
    const data = JSON.stringify(this.snapshot(), null, 2)
    this.tail = this.tail.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      await fs.writeFile(this.file + '.tmp', data)
      await fs.rename(this.file + '.tmp', this.file)
      this.lastError = null
    }).catch(error => { this.lastError = error.message })
    return this.tail
  }

  finishWindow() {
    if (!this.window) return
    this.record()
    this.window.removeListener('updateSlot', this.update)
    this.window = null
  }

  close() {
    if (this.closed) return this.tail
    this.finishWindow()
    this.closed = true
    if (this.saveTimer) { clearImmediate(this.saveTimer); this.saveTimer = null }
    if (this.records.size) this.save()
    this.bot?.removeListener('windowOpen', this.onOpen)
    this.bot?.removeListener('windowClose', this.onClose)
    for (const restore of this.restores.splice(0)) restore()
    return this.tail
  }
}

function playerState(agent) {
  const bot = agent.bot
  if (!agent.isOnline()) throw new Error('Agent is offline')
  return plain({ agentName: agent.name, sessionId: agent.sessionId, uuid: bot.entity?.uuid || bot.player?.uuid,
    source: 'mineflayer-protocol', observedAt: new Date().toISOString(), dimension: bot.game?.dimension, minecraftVersion: bot.version,
    orientation: { yaw: bot.entity?.yaw, pitch: bot.entity?.pitch, unit: 'radians' },
    motion: { velocity: bot.entity?.velocity, onGround: bot.entity?.onGround, inWater: bot.entity?.isInWater, inLava: bot.entity?.isInLava },
    controls: Object.fromEntries(['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']
      .map(control => [control, bot.getControlState?.(control) ?? bot.controlState?.[control] ?? null])),
    airSupplyTicks: bot.entity?.metadata?.[1] ?? null,
    localTerrain: localTerrain(bot),
    position: bot.entity?.position, health: bot.health, food: bot.food, oxygen: bot.oxygenLevel,
    gameMode: bot.game?.gameMode, inventorySlotSpace: bot.currentWindow ? 'current-window' : 'player-inventory',
    inventory: inventoryItems(bot).map(itemView) })
}

function localTerrain(bot) {
  if (!bot.entity?.position || !bot.blockAt) return []
  const center = bot.entity.position.floored()
  const describe = block => block ? { name: block.name, boundingBox: block.boundingBox, shapes: block.shapes } : null
  return Array.from({ length: 9 }, (_, index) => {
    const p = center.offset(index % 3 - 1, 0, Math.floor(index / 3) - 1)
    return { x: p.x, y: p.y, z: p.z, below: describe(bot.blockAt(p.offset(0, -1, 0))),
      feet: describe(bot.blockAt(p)), head: describe(bot.blockAt(p.offset(0, 1, 0))), overhead: describe(bot.blockAt(p.offset(0, 2, 0))) }
  })
}

function inventoryItems(bot) {
  const w = bot.currentWindow
  return w ? w.slots.slice(w.inventoryStart, w.inventoryEnd).filter(Boolean) : (bot.inventory?.items() || [])
}

module.exports = { InteractionMemory, playerState, itemView, inventoryItems }
