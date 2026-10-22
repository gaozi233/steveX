const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const { spectatorCompatibility } = require('../src/agent/spectator_compat')

function fixture() {
  let calls = 0
  const simulatePlayer = state => { calls++; return state }
  const bot = Object.assign(new EventEmitter(), { version: '1.21.11', game: { gameMode: 'spectator' },
    _client: new EventEmitter(), physics: { simulatePlayer, gravity: 0.08, airborneInertia: 0.91, negligeableVelocity: 0.003 } })
  const state = { pos: new Vec3(0, 80, 0), vel: new Vec3(0, 0, 0), control: {}, yaw: 0 }
  return { bot, state, simulatePlayer, calls: () => calls }
}

test('spectator idles without gravity or collisions and does not mutate global gravity', () => {
  const { bot, state, calls } = fixture()
  spectatorCompatibility(bot)
  const world = { getBlock() { throw new Error('spectator must not collide') } }
  for (let i = 0; i < 100; i++) bot.physics.simulatePlayer(state, world)
  assert.equal(state.pos.y, 80)
  assert.equal(state.vel.y, 0)
  assert.equal(bot.physics.gravity, 0.08)
  assert.equal(calls(), 0)
  assert.equal(state.onGround, false)
})

test('spectator supports horizontal controls and jump/sneak flight using server speed', () => {
  const { bot, state } = fixture()
  spectatorCompatibility(bot)
  bot._client.emit('abilities', { flyingSpeed: 0.1 })
  state.control = { forward: true, jump: true }
  bot.physics.simulatePlayer(state, {})
  assert.ok(state.pos.z < 0)
  assert.ok(state.pos.y > 80)
  state.vel.set(0, 0, 0)
  const height = state.pos.y
  state.control = { sneak: true }
  bot.physics.simulatePlayer(state, {})
  assert.ok(state.pos.y < height)
  state.control = {}
  for (let i = 0; i < 100; i++) bot.physics.simulatePlayer(state, {})
  assert.equal(state.vel.y, 0)
})

test('other modes delegate unchanged, switching back restores ordinary physics and end removes listeners', () => {
  const { bot, state, simulatePlayer, calls } = fixture()
  spectatorCompatibility(bot)
  for (const mode of ['survival', 'creative', 'adventure']) {
    bot.game.gameMode = mode
    assert.equal(bot.physics.simulatePlayer(state, {}), state)
  }
  assert.equal(calls(), 3)
  bot.emit('end')
  assert.equal(bot.physics.simulatePlayer, simulatePlayer)
  assert.equal(bot._client.listenerCount('abilities'), 0)
})

test('unverified Minecraft versions are not patched', () => {
  const { bot } = fixture()
  bot.version = '1.21.8'
  assert.equal(spectatorCompatibility(bot), false)
})

test('spectator strafing follows the existing Mineflayer yaw convention', () => {
  for (const [control, sign] of [['right', 1], ['left', -1]]) {
    const { bot, state } = fixture()
    spectatorCompatibility(bot)
    state.control = { [control]: true }
    bot.physics.simulatePlayer(state, {})
    assert.equal(Math.sign(state.pos.x), sign)
    assert.ok(Math.abs(state.pos.z) < 1e-10)
  }
})
