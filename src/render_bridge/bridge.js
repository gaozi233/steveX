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

function checkFrame(frame, before, after, agentId, memoryNamespace = 'default', perspective = 'first-person') {
  if ((frame.perspective || 'first-person') !== perspective) throw new Error('Renderer perspective differs from request; update the Fabric mod')
  if (frame.targetUuid !== before.uuid || frame.cameraUuid !== before.uuid || frame.agentId !== agentId || frame.memoryNamespace !== memoryNamespace) {
    throw new Error('Renderer returned a different player or memory identity')
  }
  const normalDimension = value => String(value).replace(/^minecraft:/, '')
  if (normalDimension(frame.dimension) !== normalDimension(before.dimension)) throw new Error('Renderer world dimension differs from player')
  const [x, y, z] = frame.camera?.position || []
  if (![x, y, z, frame.camera?.yawDegrees, frame.camera?.pitchDegrees].every(Number.isFinite)) throw new Error('Renderer camera metadata is invalid')
  const front = perspective === 'third-person-front'
  const horizontalError = Math.hypot(x - before.feet[0], z - before.feet[2])
  const yawError = Math.abs(wrapDegrees(frame.camera.yawDegrees - before.yawDegrees - (front ? 180 : 0)))
  const pitchError = Math.abs(frame.camera.pitchDegrees - (front ? -before.pitchDegrees : before.pitchDegrees))
  const movedDuringCapture = Math.hypot(...after.feet.map((v, i) => v - before.feet[i]))
  const thirdPerson = perspective !== 'first-person'
  if ((thirdPerson ? Math.hypot(x - before.feet[0], y - before.feet[1] - 1.62, z - before.feet[2]) > 6 : horizontalError > 0.5)
      || yawError > 3 || pitchError > 3 || movedDuringCapture > 0.25
      || (!thirdPerson && (y < before.feet[1] || y > before.feet[1] + 3))
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
  constructor({ bot, renderer, agentId, outputDir, memoryNamespace, isOnline = () => !!bot.entity, wait = delay }) {
    this.bot = bot
    this.renderer = renderer
    this.agentId = agentId
    this.memoryNamespace = memoryNamespace
    this.outputDir = path.resolve(outputDir)
    this.isOnline = isOnline
    this.wait = wait
  }

  async call(method, params = {}) {
    const result = await this.renderer.call(method, params)
    if (!result.ok || result.data?.ok === false) throw new Error(result.error || result.data?.error || `Renderer rejected ${method}`)
    return result.data
  }

  async captureFrame({ signal, perspective = 'first-person' } = {}) {
    if (!['first-person', 'third-person-back', 'third-person-front'].includes(perspective)) throw new Error('Invalid perspective')
    signal?.throwIfAborted()
    if (!this.isOnline()) throw new Error('Agent is offline')
    if (!this.renderer.isConnected()) throw new Error('Fabric renderer is not connected')
    const before = poseOf(this.bot)
    if (!before.uuid) throw new Error('Mineflayer UUID is not available')
    const identity = { targetUuid: before.uuid, agentId: this.agentId, memoryNamespace: this.memoryNamespace, perspective }
    await this.call('render/bind', identity)
    // Warmup belongs to the renderer; waiting for idle frames here would deadlock.
    await this.wait(350)
    signal?.throwIfAborted()
    const synchronizedPose = poseOf(this.bot)
    const requestedAt = new Date().toISOString()
    const frame = await this.call('render/capture', identity)
    signal?.throwIfAborted()
    const after = poseOf(this.bot)
    const { png, depth, alignment } = checkFrame(frame, synchronizedPose, after, this.agentId, this.memoryNamespace, perspective)
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

}

module.exports = { RenderBridge, poseOf, checkFrame, wrapDegrees }
