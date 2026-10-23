const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const dig = require('../src/commands/actions/dig')

function fixture() {
  const block = { position: new Vec3(1, 0, 0), stateId: 1, type: 1, name: 'stone', diggable: true, boundingBox: 'block' }
  let removed = false
  const bot = { _client: new EventEmitter(), entity: { position: new Vec3(0, 0, 0) },
    blockAt: () => removed ? { ...block, stateId: 0, type: 0, name: 'air' } : block,
    canDigBlock: () => true, blockAtCursor: () => block, lookAt: async () => {},
    dig: async () => { removed = true; bot._client.emit('block_change', { location: block.position, type: 0 }) } }
  return { bot, block }
}
test('dig accepts exactly crosshair, three integer coordinates, or stop', async () => {
  for (const args of [['1'], ['1','2'], ['stop','0','0'], ['1.5','0','0'], ['0','0','0','0']]) {
    const r = await dig.handler(new Proxy({}, {get(){throw Error('side effect')}}), args, {})
    assert.equal(r.errorCode, 'INVALID_ARGUMENTS')
  }
  let stopped = 0
  assert.equal((await dig.handler({stopDigging(){stopped++}}, ['STOP'])).mode, 'stop')
  assert.equal(stopped, 1)
  assert.equal(require('../src/commands').loadCommands().commands.mine, undefined)
})
test('nearby coordinate and crosshair dig share server-confirmed feedback without pathfinding', async () => {
  for (const args of [[], ['1','0','0']]) {
    const {bot} = fixture()
    const r = await dig.handler(bot, args, {})
    assert.equal(r.action, 'dig'); assert.equal(r.confirmed, true)
    assert.equal(r.approachAttempted, false); assert.equal(r.approached, false)
    assert.equal(r.mode, args.length ? 'coordinates' : 'crosshair')
    assert.equal(r.phase, 'dig'); assert.equal(r.changes[0].after, 'air')
    assert.deepEqual(r.target.position, {x:1,y:0,z:0})
  }
})
test('coordinate dig refuses occluded or changed targets after aiming', async () => {
  for (const changed of [false, true]) {
    const {bot,block} = fixture()
    bot.blockAtCursor = () => changed ? {...block,stateId:2} : {...block,position:new Vec3(0,0,0)}
    bot.dig = async () => assert.fail('must not dig')
    const r = await dig.handler(bot, ['1','0','0'], {})
    assert.equal(r.errorCode, changed ? 'TARGET_CHANGED' : 'TARGET_OBSTRUCTED')
    assert.deepEqual(r.changes, []); assert.equal(r.target.block, 'stone')
  }
})
test('coordinate dig reports protected approach and cancellation without claiming destruction', async () => {
  for (const abort of [false, true]) {
    const {bot} = fixture(), controller = new AbortController()
    let reached = false, cleared = false
    bot.canDigBlock = () => reached
    const movements = {canDig:true,allow1by1towers:true,scafoldingBlocks:[1]}
    bot.pathfinder = {setMovements(){},setGoal(){cleared=true},goto:async()=>{
      assert.equal(movements.canDig,false)
      if (abort) controller.abort(); else reached=true
    }}
    const r = await dig.handler(bot, ['1','0','0'], {movements}, {signal:controller.signal})
    assert.equal(r.approachAttempted,true); assert.equal(cleared,true); assert.equal(movements.canDig,true)
    assert.equal(r.confirmed,!abort)
    if (abort) {assert.equal(r.status,'cancelled');assert.deepEqual(r.changes,[]);assert.equal(r.phase,'approach')}
    else assert.equal(r.approached,true)
  }
})
