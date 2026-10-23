const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const placeentity = require('../src/commands/placement/entity')

function fixture(item = 'cow_spawn_egg') {
  const bot = new EventEmitter(), controller = new AbortController()
  const entityName = item === 'cow_spawn_egg' ? 'cow' : item
  let count = 2, snapshots = 0, interactions = 0
  bot.registry = { entitiesByName: {cow:{},oak_boat:{},oak_chest_boat:{},bamboo_raft:{}} }
  bot.game = {gameMode:'survival'}
  bot.heldItem = {name:item,spawnEggMobName:item === 'cow_spawn_egg' ? 'cow' : undefined}
  bot.inventory = {items:()=>[{name:item,count}]}
  bot.entities = {1:{id:1,name:entityName,position:new Vec3(.5,0,.5)}}
  bot._syncWindow = async () => {snapshots++}
  bot.blockAtCursor = () => ({name:'obsidian',position:new Vec3(0,-1,0),face:1,intersect:new Vec3(.3,0,.7)})
  const spawn = (id=2,name=entityName,p=new Vec3(.5,0,.5)) => {const entity={id,name,uuid:`uuid-${id}`,position:p};bot.emit('entitySpawn',entity);return entity}
  const interact = async () => {interactions++;count--;spawn()}
  bot._genericPlace = async (target,face,options) => {assert.equal(options.forceLook,'ignore');assert.deepEqual(options.delta,new Vec3(.3,1,.7));await interact()}
  bot.activateItem = () => {interact()}
  let deactivated = false
  bot.deactivateItem = () => {deactivated=true}
  return {bot,controller,spawn,setCount:n=>{count=n},snapshots:()=>snapshots,interactions:()=>interactions,deactivated:()=>deactivated}
}
function cleaned(bot) {assert.equal(bot.listenerCount('entitySpawn'),0);assert.equal(bot.listenerCount('end'),0)}

for (const item of ['cow_spawn_egg','oak_boat','oak_chest_boat','bamboo_raft','armor_stand','end_crystal']) {
  test(`placeentity confirms native interaction and actual type for ${item}`, async () => {
    const f=fixture(item)
    if (item.endsWith('_boat') || item.endsWith('_raft')) f.bot._genericPlace=()=>{throw Error('boat must use activateItem')}
    else f.bot.activateItem=()=>{throw Error('non-boat must use genericPlace')}
    const r=await placeentity.handler(f.bot,[],{})
    assert.equal(r.ok,true);assert.equal(r.target.entityId,2);assert.equal(r.target.entity,item === 'cow_spawn_egg'?'cow':item)
    assert.equal(r.changes[0].delta,-1);assert.equal(f.snapshots(),2)
    assert.equal(f.deactivated(),item.endsWith('_boat')||item.endsWith('_raft'));cleaned(f.bot)
  })
}

test('unrelated, distant, old and duplicate spawns cannot replace the expected new spawn', async () => {
  const f=fixture()
  f.bot._genericPlace=async()=>{
    f.spawn(3,'pig');f.spawn(4,'cow',new Vec3(40,0,0));f.spawn(1)
    const entity=f.spawn(2);entity.position.x=20;f.spawn(2,'cow',new Vec3(1.5,0,.5))
    f.setCount(1)
  }
  const r=await placeentity.handler(f.bot,[],{})
  assert.equal(r.ok,true);assert.deepEqual(r.target.position,{x:.5,y:0,z:.5});cleaned(f.bot)
})

test('ambiguous matching new spawns fail conservatively and retain item loss', async () => {
  const f=fixture();f.bot._genericPlace=async()=>{f.spawn(2);f.spawn(3);f.setCount(1)}
  const r=await placeentity.handler(f.bot,[],{})
  assert.equal(r.errorCode,'AMBIGUOUS_ENTITY_SPAWN');assert.equal(r.observedEntities.length,2);assert.equal(r.changes[0].delta,-1);cleaned(f.bot)
})

test('spawn alone without survival consumption is not success; creative needs no consumption', async () => {
  const f=fixture();f.bot._genericPlace=async()=>f.spawn()
  let r=await placeentity.handler(f.bot,[],{});assert.equal(r.errorCode,'ITEM_CONSUMPTION_NOT_CONFIRMED');assert.deepEqual(r.changes,[]);cleaned(f.bot)
  f.bot.game.gameMode='creative';r=await placeentity.handler(f.bot,[],{});assert.equal(r.ok,true);cleaned(f.bot)
})

test('no spawn times out with actual consumed items, not a claim of no effects', async () => {
  const f=fixture();f.bot._genericPlace=async()=>f.setCount(1)
  const r=await placeentity.handler(f.bot,[],{})
  assert.equal(r.errorCode,'ENTITY_SPAWN_NOT_CONFIRMED');assert.equal(r.changes[0].delta,-1);assert.ok(r.output.includes('inspect before retrying'));cleaned(f.bot)
})

test('cancellation retains already observed spawn and consumed item, cleaning listeners', async () => {
  const f=fixture();f.bot._genericPlace=async()=>{f.spawn();f.setCount(1);f.controller.abort()}
  const r=await placeentity.handler(f.bot,[],{},{signal:f.controller.signal})
  assert.equal(r.status,'cancelled');assert.equal(r.errorCode,'CANCELLED');assert.equal(r.target.entityId,2);assert.equal(r.changes[0].delta,-1);cleaned(f.bot)
})

test('final inventory failure preserves spawn evidence and marks inventory unknown', async () => {
  const f=fixture();let calls=0;f.bot._syncWindow=async()=>{if(++calls===2)throw Error('offline')}
  const r=await placeentity.handler(f.bot,[],{})
  assert.equal(r.errorCode,'INVENTORY_CONFIRMATION_UNAVAILABLE');assert.equal(r.changes,null);assert.equal(r.target.entityId,2);assert.deepEqual(r.evidence,['server-entity-spawn']);cleaned(f.bot)
})

test('disconnect exits spawn wait and returns failure, rather than a late success', async () => {
  const f=fixture();f.bot._genericPlace=async()=>f.bot.emit('end')
  const r=await placeentity.handler(f.bot,[],{})
  assert.equal(r.errorCode,'DISCONNECTED');assert.equal(r.changes,null);assert.equal(f.snapshots(),1);cleaned(f.bot)
})

test('interaction error still snapshots actual effects without retrying', async () => {
  const f=fixture();let calls=0;f.bot._genericPlace=async()=>{calls++;f.setCount(1);throw Error('send failed')}
  const r=await placeentity.handler(f.bot,[],{})
  assert.equal(calls,1);assert.equal(r.errorCode,'ENTITY_INTERACTION_FAILED');assert.equal(r.changes[0].delta,-1);cleaned(f.bot)
})

test('preflight rejects arguments, open window, unsupported item, missing aim and wrong crystal base', async () => {
  for(const [mode,code] of [['args','INVALID_ARGUMENTS'],['window','WINDOW_OPEN'],['item','UNSUPPORTED_ITEM'],['aim','NO_TARGET'],['base','INVALID_SURFACE'],['sync','INVENTORY_SYNC_FAILED']]){
    const f=fixture(mode==='base'?'end_crystal':'cow_spawn_egg')
    if(mode==='window')f.bot.currentWindow={}
    if(mode==='item')f.bot.heldItem={name:'painting'}
    if(mode==='aim')f.bot.blockAtCursor=()=>null
    if(mode==='base')f.bot.blockAtCursor=()=>({name:'stone',position:new Vec3(0,-1,0),face:1,intersect:new Vec3(.5,0,.5)})
    if(mode==='sync')f.bot._syncWindow=async()=>{throw Error('offline')}
    const r=await placeentity.handler(f.bot,mode==='args'?['extra']:[],{})
    assert.equal(r.errorCode,code);assert.deepEqual(r.changes,[]);assert.equal(f.interactions(),0);cleaned(f.bot)
  }
})
