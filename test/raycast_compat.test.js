const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const { raycastCompatibility } = require('../src/agent/raycast_compat')
test('raycast accepts zero angles, delegates nonzero angles and restores on disconnect', () => {
  const bot = new EventEmitter(), original = () => 'original'
  bot.blockAtEntityCursor = original
  bot.entity = { position: new Vec3(0,0,0), height: 1.8, yaw: 0, pitch: 0 }
  bot.world = { raycast: (origin, direction, distance, matcher) => ({ origin, direction, distance, matcher }) }
  assert.ok(raycastCompatibility(bot))
  const matcher = () => true, r = bot.blockAtEntityCursor(undefined, 4.5, matcher)
  assert.equal(r.direction.z, -1); assert.equal(r.origin.y, 1.8); assert.equal(r.distance, 4.5); assert.equal(r.matcher, matcher)
  bot.entity.yaw = 1; assert.notEqual(bot.blockAtEntityCursor(), 'original')
  bot.entity.pitch = 1; assert.equal(bot.blockAtEntityCursor(), 'original')
  bot.entity.yaw = 0; bot.entity.pitch = NaN; assert.equal(bot.blockAtEntityCursor(), null)
  bot.emit('end'); assert.equal(bot.blockAtEntityCursor, original)
})

test('raycast uses standing/crouched eye height at nonzero angles, matching lookAt', () => {
  const bot = new EventEmitter()
  bot.blockAtEntityCursor = () => 'original'
  bot.entity = { position:new Vec3(2,3,4),height:1.8,eyeHeight:1.62,yaw:1,pitch:0.3 }
  bot.world = { raycast:(origin,direction)=>({origin,direction}) }
  assert.ok(raycastCompatibility(bot))
  assert.equal(bot.blockAtEntityCursor().origin.y,4.62)
  bot.entity.eyeHeight=1.27
  assert.equal(bot.blockAtEntityCursor().origin.y,4.27)
  bot.entity.eyeHeight=NaN
  assert.equal(bot.blockAtEntityCursor(),null)
})
