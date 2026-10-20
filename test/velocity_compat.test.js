const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')

const { installVelocityCompatibility } = require('../src/agent/velocity_compat')

function createBot(version) {
  return {
    version,
    _client: new EventEmitter(),
    entities: {
      7: { velocity: new Vec3(0, 0, 0) }
    }
  }
}

test('1.21.11 velocity packets are already in blocks per tick', () => {
  const bot = createBot('1.21.11')

  assert.equal(installVelocityCompatibility(bot), true)
  bot._client.emit('entity_velocity', {
    entityId: 7,
    velocity: { x: 0.4, y: 0.2, z: -0.1 }
  })

  assert.deepEqual(bot.entities[7].velocity, new Vec3(0.4, 0.2, -0.1))
})

test('legacy velocity decoding remains owned by Mineflayer', () => {
  const bot = createBot('1.21.10')

  assert.equal(installVelocityCompatibility(bot), false)
  bot._client.emit('entity_velocity', {
    entityId: 7,
    velocity: { x: 3200, y: 1600, z: -800 }
  })

  assert.deepEqual(bot.entities[7].velocity, new Vec3(0, 0, 0))
})
