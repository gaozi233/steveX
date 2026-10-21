const fs = require('node:fs/promises')
const path = require('node:path')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const wrapDegrees = degrees => ((degrees + 180) % 360 + 360) % 360 - 180

function poseOf(bot) {
  if (!bot.entity) throw new Error('Mineflayer player has not spawned')
  const { position: p, yaw, pitch, uuid } = bot.entity
  return {
    uuid: uuid || bot.player?.uuid,
    dimension: bot.game.dimension,
    feet: [p.x, p.y, p.z],
    yawDegrees: wrapDegrees(180 - yaw * 180 / Math.PI),
    pitchDegrees: -pitch * 180 / Math.PI,
  }
}

function checkFrame(frame, before, after, agentId, memoryNamespace = 'default') {
  if (frame.targetUuid !== before.uuid || frame.cameraUuid !== before.uuid || frame.agentId !== agentId || frame.memoryNamespace !== memoryNamespace) {
    throw new Error('Renderer returned a different player or memory identity')
  }
  const normalDimension = value => String(value).replace(/^minecraft:/, '')
  if (normalDimension(frame.dimension) !== normalDimension(before.dimension)) throw new Error('Renderer world dimension differs from player')
  const [x, y, z] = frame.camera?.position || []
  if (![x, y, z, frame.camera?.yawDegrees, frame.camera?.pitchDegrees].every(Number.isFinite)) throw new Error('Renderer camera metadata is invalid')
  const horizontalError = Math.hypot(x - before.feet[0], z - before.feet[2])
  const yawError = Math.abs(wrapDegrees(frame.camera.yawDegrees - before.yawDegrees))
  const pitchError = Math.abs(frame.camera.pitchDegrees - before.pitchDegrees)
  const movedDuringCapture = Math.hypot(...after.feet.map((v, i) => v - before.feet[i]))
  if (horizontalError > 0.5 || yawError > 3 || pitchError > 3 || movedDuringCapture > 0.25
      || y < before.feet[1] || y > before.feet[1] + 3
      || Math.abs(wrapDegrees(after.yawDegrees - before.yawDegrees)) > 1
      || Math.abs(after.pitchDegrees - before.pitchDegrees) > 1 || after.uuid !== before.uuid
      || after.dimension !== before.dimension) throw new Error('Player/camera moved or did not synchronize; stop movement and retry')
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height)
      || frame.width <= 0 || frame.height <= 0 || frame.width * frame.height > 16_777_216) throw new Error('Invalid render dimensions')
  const png = Buffer.from(frame.rgb?.base64 || '', 'base64')
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || png.length < 24 || png.readUInt32BE(16) !== frame.width || png.readUInt32BE(20) !== frame.height) throw new Error('Invalid RGB PNG or frame dimensions')
  if (frame.depth?.encoding !== 'float32-le-base64' || frame.depth?.origin !== 'top-left') throw new Error('Unsupported depth format')
  const depth = Buffer.from(frame.depth.base64, 'base64')
  if (depth.length !== frame.width * frame.height * 4) throw new Error('Depth dimensions differ from RGB')
  return { png, depth, alignment: { horizontalError, yawError, pitchError, movedDuringCapture } }
}

class RenderBridge {
  constructor({ bot, renderer, agentId, outputDir, memoryNamespace = 'default', renderQueue = null, allowSwitch = false, isOnline = () => !!bot.entity, wait = delay }) {
    this.bot = bot
    this.renderer = renderer
    this.agentId = agentId
    this.memoryNamespace = memoryNamespace
    this.renderQueue = renderQueue
    this.allowSwitch = allowSwitch
    this.outputDir = path.resolve(outputDir)
    this.isOnline = isOnline
    this.wait = wait
    this.tail = Promise.resolve()
    this.queued = 0
    this.closed = false
  }

  enqueue(operation) {
    if (this.closed) return Promise.reject(new Error('Bridge is closed'))
    if (this.queued >= 8) return Promise.reject(new Error('Bridge queue is full'))
    this.queued++
    const next = this.tail.then(() => {
      if (this.closed) throw new Error('Bridge is closed')
      if (!this.isOnline()) throw new Error('Mineflayer player is offline')
      return operation()
    })
    this.tail = next.catch(() => {}).finally(() => { this.queued-- })
    return next
  }

  async call(method, params = {}) {
    const result = await this.renderer.call(method, params)
    if (!result.ok || result.data?.ok === false) throw new Error(result.error || result.data?.error || `Renderer rejected ${method}`)
    return result.data
  }

  capture() {
    return this.enqueue(() => this.renderQueue ? this.renderQueue.run(() => this.captureFrame()) : this.captureFrame())
  }

  async captureFrame() {
    if (this.closed || !this.isOnline()) throw new Error('Agent is closed or offline')
    if (!this.renderer.isConnected()) throw new Error('Fabric renderer is not connected')
    const before = poseOf(this.bot)
    if (!before.uuid) throw new Error('Mineflayer UUID is not available')
    const state = await this.call('render/status')
    if (!this.allowSwitch && state.targetUuid && state.targetUuid !== before.uuid) throw new Error('Renderer is bound to another player')
    const identity = { targetUuid: before.uuid, agentId: this.agentId, memoryNamespace: this.memoryNamespace }
    await this.call('render/bind', identity)
    // Warmup belongs to the renderer; waiting for idle frames here would deadlock.
    await this.wait(350)
    if (this.closed) throw new Error('Bridge is closed')
    const synchronizedPose = poseOf(this.bot)
    const requestedAt = new Date().toISOString()
    const frame = await this.call('render/capture', identity)
    const after = poseOf(this.bot)
    const { png, depth, alignment } = checkFrame(frame, synchronizedPose, after, this.agentId, this.memoryNamespace)
    if (typeof frame.frameId !== 'string' || !/^[a-f0-9-]{36}$/i.test(frame.frameId)) throw new Error('Invalid frame identity')
    await fs.mkdir(this.outputDir, { recursive: true })
    const stem = frame.frameId
    const { rgb, depth: depthInfo, ...metadata } = frame
    const result = {
      ...metadata, requestedAt, receivedAt: new Date().toISOString(),
      targetPoseBefore: synchronizedPose, targetPoseAfter: after, alignment,
      rgb: { mimeType: 'image/png', file: `${stem}.png` },
      depth: { ...depthInfo, base64: undefined, file: `${stem}.depth.f32` },
      metadataFile: `${stem}.json`,
    }
    await fs.writeFile(path.join(this.outputDir, result.rgb.file), png)
    await fs.writeFile(path.join(this.outputDir, result.depth.file), depth)
    await fs.writeFile(path.join(this.outputDir, result.metadataFile), JSON.stringify(result, null, 2) + '\n')
    return result
  }

  action(input) {
    return this.enqueue(async () => {
      switch (input.type) {
        case 'look': {
          if (![input.yawDegrees, input.pitchDegrees].every(Number.isFinite) || Math.abs(input.pitchDegrees) > 90) throw new Error('look requires yawDegrees and pitchDegrees (-90..90)')
          await this.bot.look((180 - input.yawDegrees) * Math.PI / 180, -input.pitchDegrees * Math.PI / 180, true)
          await this.wait(150)
          break
        }
        case 'move': {
          if (!['forward', 'back', 'left', 'right', 'jump', 'sneak', 'sprint'].includes(input.control)
              || !Number.isInteger(input.durationMs) || input.durationMs < 1 || input.durationMs > 5000) throw new Error('move requires control and durationMs (1..5000)')
          this.bot.setControlState(input.control, true)
          try { await this.wait(input.durationMs) } finally { this.bot.clearControlStates() }
          break
        }
        default: throw new Error('Supported actions: look, move')
      }
      return poseOf(this.bot)
    })
  }

  stop() {
    this.bot.clearControlStates()
  }

  close() {
    this.closed = true
    this.stop()
  }
}

module.exports = { RenderBridge, poseOf, checkFrame, wrapDegrees }
