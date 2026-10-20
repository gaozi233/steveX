const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')

const { velocityCompatibility } = require('../src/agent/velocity_compat')

function createBot(version) {
  return Object.assign(new EventEmitter(), {
    version,
    _client: new EventEmitter(),
    oxygenLevel: 20,
    entity: { id: 7 },
    entities: {
      7: { velocity: new Vec3(0, 0, 0) }
    }
  })
}

test('1.21.11 velocity packets are already in blocks per tick', () => {
  const bot = createBot('1.21.11')

  // Reproduce Mineflayer's built-in listener, which runs before our plugin.
  bot._client.on('entity_velocity', (packet) => {
    bot.entities[packet.entityId].velocity.set(
      packet.velocity.x / 8000,
      packet.velocity.y / 8000,
      packet.velocity.z / 8000
    )
  })

  assert.equal(velocityCompatibility(bot), true)
  bot._client.emit('entity_velocity', {
    entityId: 7,
    velocity: { x: 0.4, y: 0.2, z: -0.1 }
  })

  assert.deepEqual(bot.entities[7].velocity, new Vec3(0.4, 0.2, -0.1))
})

test('nearby entity metadata cannot overwrite the bot oxygen level', () => {
  const bot = createBot('1.21.11')

  bot._client.on('entity_metadata', (packet) => {
    bot.oxygenLevel = packet.oxygenLevel
  })
  velocityCompatibility(bot)

  bot._client.emit('entity_metadata', { entityId: 7, oxygenLevel: 400 })
  bot._client.emit('entity_metadata', { entityId: 9, oxygenLevel: 400 })

  assert.equal(bot.oxygenLevel, 20)
})

test('spawn normalizes oxygen when initial metadata arrived before plugins loaded', () => {
  const bot = createBot('1.21.11')
  bot.oxygenLevel = 400

  velocityCompatibility(bot)
  bot.emit('spawn')

  assert.equal(bot.oxygenLevel, 20)
})

test('legacy velocity decoding remains owned by Mineflayer', () => {
  const bot = createBot('1.21.10')

  assert.equal(velocityCompatibility(bot), false)
  bot._client.emit('entity_velocity', {
    entityId: 7,
    velocity: { x: 3200, y: 1600, z: -800 }
  })

  assert.deepEqual(bot.entities[7].velocity, new Vec3(0, 0, 0))
})
