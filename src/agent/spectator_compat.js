const installedPhysics = require('prismarine-physics/package.json').version

// Remove this narrow backport when upgrading the physics dependency and retest.
function spectatorCompatibility(bot) {
  if (bot.version !== '1.21.11' || installedPhysics !== '1.11.1') return false
  const physics = bot.physics
  const simulate = physics.simulatePlayer
  let flyingSpeed = 0.05
  const abilities = packet => {
    if (Number.isFinite(packet.flyingSpeed) && packet.flyingSpeed >= 0) flyingSpeed = packet.flyingSpeed
  }
  bot._client.on('abilities', abilities)
  const wrapped = function (state, world) {
    if (bot.game.gameMode !== 'spectator') return simulate.call(this, state, world)
    const { vel, pos, control } = state
    // Spectator is no-clip flight: no ground, fluid forces, gravity or jumping.
    // Match the upstream flight acceleration and vertical damping conventions.
    for (const axis of ['x', 'y', 'z']) if (Math.abs(vel[axis]) < physics.negligeableVelocity) vel[axis] = 0
    let strafe = ((control.right ? 1 : 0) - (control.left ? 1 : 0)) * 0.98
    let forward = ((control.forward ? 1 : 0) - (control.back ? 1 : 0)) * 0.98
    const length = Math.hypot(strafe, forward)
    if (length > 0) {
      const scale = flyingSpeed * (control.sprint ? 2 : 1) / Math.max(1, length)
      strafe *= scale; forward *= scale
      const sin = Math.sin(Math.PI - state.yaw), cos = Math.cos(Math.PI - state.yaw)
      vel.x -= strafe * cos + forward * sin
      vel.z += forward * cos - strafe * sin
    }
    vel.y += ((control.jump ? 1 : 0) - (control.sneak ? 1 : 0)) * Math.fround(flyingSpeed * 3)
    pos.x += vel.x; pos.y += vel.y; pos.z += vel.z
    vel.x *= physics.airborneInertia; vel.z *= physics.airborneInertia; vel.y *= 0.6
    state.onGround = false
    state.isInWater = false; state.isInLava = false; state.isInWeb = false
    state.isCollidedHorizontally = false; state.isCollidedVertically = false
    state.elytraFlying = false; state.jumpTicks = 0; state.jumpQueued = false
    return state
  }
  physics.simulatePlayer = wrapped
  bot.once('end', () => {
    bot._client.removeListener('abilities', abilities)
    if (physics.simulatePlayer === wrapped) physics.simulatePlayer = simulate
  })
  return true
}

module.exports = { spectatorCompatibility }
