const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const place = require('../src/commands/actions/place')
const { observeBlocks } = require('../src/commands/operation_result')

function fixture(item, facing = 'north', mode = 'complete') {
  const client = new EventEmitter(), ground = new Vec3(0,-1,0), foot = new Vec3(0,0,0)
  const door = item.endsWith('_door'), head = door ? new Vec3(0,1,0) : facing === 'east' ? new Vec3(1,0,0) : new Vec3(0,0,-1)
  const world = new Map(), air = p => ({ name:'air', type:0, stateId:0, position:p })
  const make = (point, stateId, p) => ({ name:item, type:1, stateId, position:point, getProperties:()=>p })
  let count = 2
  const bot = {
    _client: client, game: { gameMode:'survival' }, registry: { blocksByName: { [item]:{} } }, heldItem:{name:item},
    inventory:{ items:()=>[{name:item,count}] }, _syncWindow:async()=>{},
    blockAt:p=>world.get(p.toString()) || air(p),
    blockAtCursor:()=>({position:ground,face:1,intersect:new Vec3(.5,0,.5)})
  }
  bot._genericPlace = async () => {
    assert.equal(client.listenerCount('block_change'),1)
    assert.equal(client.listenerCount('multi_block_change'),1)
    world.set(foot.toString(), make(foot,1,door ? {half:'lower',facing,hinge:'left',open:false} : {part:'foot',facing,occupied:false}))
    client.emit('block_change',{location:foot,type:1})
    const updateHead = () => {
      world.set(head.toString(), make(head,2,door ? {half:'upper',facing:mode==='wrong-facing'?'south':facing,hinge:'left',open:false} : {part:'head',facing,occupied:false}))
      if (mode !== 'prediction') client.emit('block_change',{location:head,type:2})
    }
    if (mode !== 'missing') {
      if (mode === 'delayed') setTimeout(updateHead,20)
      else updateHead()
    }
    if (mode !== 'no-consumption') count--
  }
  return {bot,foot,head}
}

for (const [item,facing,mode] of [
  ['oak_door','north','complete'], ['red_bed','north','complete'], ['blue_bed','east','delayed'],
  ['oak_door','north','wrong-facing'], ['red_bed','north','missing'], ['red_bed','north','prediction'],
  ['oak_door','north','no-consumption']
]) {
  test(`multi-block placement: ${item} ${facing} ${mode}`, async () => {
    const {bot,foot,head} = fixture(item,facing,mode)
    const r = await place.handler(bot,[],{})
    const success = ['complete','delayed'].includes(mode)
    assert.equal(r.ok,success)
    assert.equal(r.changes.filter(c=>c.kind==='block').length, success || mode === 'no-consumption' ? 2 : 1)
    assert.equal(bot._client.listenerCount('block_change'),0)
    assert.equal(bot._client.listenerCount('multi_block_change'),0)
    if (success) {
      assert.deepEqual(r.target.position,{x:foot.x,y:foot.y,z:foot.z})
      assert.equal(r.target.properties.facing,facing)
      assert.deepEqual(r.changes.find(c=>c.kind==='block'&&c.position.x===head.x&&c.position.y===head.y&&c.position.z===head.z).properties.facing,facing)
      assert.ok(r.output.includes(item)); assert.ok(r.output.includes(facing))
    } else {
      assert.equal(r.errorCode,mode === 'no-consumption' ? 'PLACEMENT_NOT_CONFIRMED' : 'STRUCTURE_NOT_CONFIRMED')
      assert.ok(r.output.includes('observed changes'))
    }
  })
}

test('neighbor shape update does not override the actual adjacent placement position', async () => {
  const {bot} = fixture('oak_stairs')
  const reference = new Vec3(0,-1,0), dest = new Vec3(0,0,0)
  const old = {name:'oak_stairs',type:1,stateId:5,getProperties:()=>({shape:'straight'})}
  let changed = false
  bot.blockAt = p => p.equals(reference) ? {...old,stateId:changed?6:5} : changed ? {...old,stateId:7} : {name:'air',type:0,stateId:0}
  bot._genericPlace = async () => {changed=true;bot.inventory.items=()=>[{name:'oak_stairs',count:1}];bot._client.emit('block_change',{location:reference,type:6});bot._client.emit('block_change',{location:dest,type:7})}
  const r = await place.handler(bot,[],{})
  assert.equal(r.ok,true)
  assert.deepEqual(r.target.position,{x:0,y:0,z:0})
})

test('batch observation uses one listener pair, handles negative chunks and ignores other positions', () => {
  const bot = {_client:new EventEmitter()}, points = [new Vec3(-1,-1,-1),new Vec3(0,0,0)]
  const observed = observeBlocks(bot,points)
  assert.equal(bot._client.listenerCount('block_change'),1)
  bot._client.emit('multi_block_change',{chunkCoordinates:{x:-1,y:-1,z:-1},records:[(5<<12)|(15<<8)|(15<<4)|15]})
  bot._client.emit('block_change',{location:new Vec3(0,0,0),type:7})
  bot._client.emit('block_change',{location:new Vec3(1,0,0),type:9})
  assert.equal(observed.stateId(points[0]),5)
  assert.equal(observed.stateId(points[1]),7)
  assert.equal(observed.stateId(new Vec3(1,0,0)),null)
  observed.close()
  assert.equal(bot._client.listenerCount('block_change'),0)
  assert.equal(bot._client.listenerCount('multi_block_change'),0)
})
