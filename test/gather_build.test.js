const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const dig = require('../src/commands/actions/dig')
const collect = require('../src/commands/actions/collect')
const craft = require('../src/commands/actions/craft')
const place = require('../src/commands/placement/block')
const placeentity = require('../src/commands/placement/entity')
const { result, aimedFace, observeBlock, waitFor } = require('../src/commands/operation_result')

function basic() {
  const bot = new EventEmitter()
  bot.entity = { position: new Vec3(0,0,0) }
  bot._client = new EventEmitter(); bot.game = { gameMode: 'survival' }
  bot.inventory = { slots: Array(46).fill(null), inventoryStart: 9, inventoryEnd: 45, items() { return this.slots.slice(9,45).filter(Boolean) } }
  bot._syncWindow = async () => {}
  return bot
}
test('result contract never upgrades unconfirmed success, and all early failures are structured', async () => {
  assert.equal(result('dig', { ok: true }).ok, false)
  for (const [name, handler, bot, args, agent] of [
    ['dig',dig.handler,{blockAtCursor:()=>null},[],{}], ['dig',dig.handler,{},['Infinity','0','0'],{}],
    ['collect',collect.handler,{},[],{}], ['craft',craft.handler,{},['stone','2abc'],{}],
    ['place',place.handler,{blockAtCursor:()=>null},[],{}], ['placeentity',placeentity.handler,{blockAtCursor:()=>null},[],{}]
  ]) { const r=await handler(bot,args,agent); assert.equal(r.action,name);assert.equal(r.status,'failed');assert.equal(r.confirmed,false);assert.ok('target' in r && 'changes' in r && 'evidence' in r) }
})
test('dig requires inbound server block change, not merely local prediction, and cleans observers', async () => {
  const bot=basic(), p=new Vec3(1,0,0), block={position:p,stateId:1,type:1,name:'stone'}
  bot.blockAtCursor=()=>block;bot.canDigBlock=()=>true;bot.blockAt=()=>({type:0,name:'air'})
  bot.dig=async()=>bot._client.emit('block_change',{location:p,type:0})
  const r=await dig.handler(bot,[],{});assert.equal(r.confirmed,true);assert.deepEqual(r.evidence,['server-block-update']);assert.equal(bot._client.listenerCount('block_change'),0)
  const controller=new AbortController();bot.dig=async()=>controller.abort(new Error('stop'))
  assert.equal((await dig.handler(bot,[],{}, {signal:controller.signal})).status,'cancelled');assert.equal(bot._client.listenerCount('multi_block_change'),0)
})
test('coordinate dig protects approach terrain and restores settings, and refuses changed targets', async () => {
  const bot=basic(), block={position:new Vec3(1,0,0),stateId:1,type:1,name:'stone',diggable:true,boundingBox:'block'}
  let current=block, dug=false
  const movements={canDig:true,allow1by1towers:true,scafoldingBlocks:[1]}
  bot.blockAt=()=>current;bot.canDigBlock=()=>false;bot.pathfinder={setGoal:()=>{},setMovements:()=>{},goto:async()=>{assert.equal(movements.canDig,false);current={...block,stateId:2}}};bot.dig=async()=>{dug=true}
  const r=await dig.handler(bot,['1','0','0'],{bot,movements});assert.equal(r.ok,false);assert.equal(dug,false);assert.equal(movements.canDig,true);assert.deepEqual(movements.scafoldingBlocks,[1])
})
test('collect confirms own pickup and inventory gain, selects nearest and cleans listeners', async () => {
  const bot=basic();bot.entity={id:10,position:new Vec3(0,0,0)}
  bot.entities={1:{id:1,name:'item',position:new Vec3(5,0,0)},2:{id:2,name:'item',position:new Vec3(2,0,0)}}
  const movements={canDig:true,allow1by1towers:true,scafoldingBlocks:[1]}
  bot.pathfinder={setGoal:()=>{},setMovements:()=>{},goto:async goal=>{assert.equal(goal.x,2);assert.equal(movements.canDig,false);assert.equal(movements.allow1by1towers,false);assert.deepEqual(movements.scafoldingBlocks,[]);bot.entity.position=new Vec3(2,0,0);bot.inventory.slots[9]={name:'emerald',count:3};bot.emit('playerCollect',bot.entity,bot.entities[2])}}
  const r=await collect.handler(bot,[],{movements});assert.equal(r.ok,true);assert.equal(r.changes[0].delta,3);assert.equal(bot.listenerCount('playerCollect'),0);assert.equal(movements.canDig,true);assert.deepEqual(movements.scafoldingBlocks,[1])
})
function craftingBot() {
  const bot=basic();bot.registry=require('minecraft-data')('1.21.11');bot.entity={position:new Vec3(0,0,0)}
  const log=bot.registry.itemsByName.oak_log, plank=bot.registry.itemsByName.oak_planks
  bot.inventory.slots[9]={type:log.id,name:log.name,count:2}
  const recipe={result:{id:plank.id,count:4},delta:[{id:log.id,count:-1},{id:plank.id,count:4}]}
  bot.recipesFor=()=>[recipe];bot.recipesAll=()=>[recipe];bot.craft=async(_,times)=>{assert.equal(times,1);const slot=bot.inventory.slots[9];slot.count--;if(!slot.count)bot.inventory.slots[9]=null;const p=bot.inventory.slots[10];bot.inventory.slots[10]={type:plank.id,name:plank.name,count:(p?.count||0)+4}}
  bot.findBlocks=()=>[]
  return {bot,recipe}
}
test('craft verifies output AND ingredient deltas; times remains recipe executions', async () => {
  const {bot}=craftingBot();const r=await craft.handler(bot,['oak_planks','2'],{bot})
  assert.equal(r.ok,true);assert.equal(r.producedCount,8);assert.equal(r.completedExecutions,2);assert.ok(r.changes.some(c=>c.item==='oak_log'&&c.delta===-2))
  assert.equal(r.phase,'execution');assert.equal(r.effect,'observed');assert.equal(r.changesScope,'net-inventory-by-item-name')
  assert.ok(r.output.includes(JSON.stringify(r.changes)));assert.match(r.output,/recipeIndex=1/)
  const bad=craftingBot().bot;bad.craft=async()=>{bad.inventory.slots[10]={name:'oak_planks',count:4}}
  assert.equal((await craft.handler(bad,['oak_planks'],{bot:bad})).errorCode,'INVENTORY_MISMATCH')
})
test('craft auto selects visible reachable table, rejects absent table and capacity shortage', async () => {
  const {bot,recipe}=craftingBot(),table={name:'crafting_table',position:new Vec3(2,0,0)}
  recipe.requiresTable=true
  bot.findBlocks=()=>[table.position];bot.blockAt=()=>table;bot.canSeeBlock=()=>true;bot.recipesFor=(_id,_m,_n,t)=>t?[recipe]:[]
  const original=bot.craft;bot.craft=async(r,n,t)=>{assert.equal(t,table);await original(r,n)}
  assert.equal((await craft.handler(bot,['oak_planks','1','auto'],{bot})).target.station,'table')
  bot.canSeeBlock=()=>false;assert.equal((await craft.handler(bot,['oak_planks','1','table'],{bot})).ok,false)
  const full=craftingBot().bot;for(let i=10;i<45;i++)full.inventory.slots[i]={type:full.registry.itemsByName.stone.id,count:64}
  assert.equal((await craft.handler(full,['oak_planks','2'],{bot:full})).ok,false)
})
test('craft preserves partial progress on cancellation and does not start next execution', async () => {
  const {bot}=craftingBot(),controller=new AbortController();let calls=0
  const original=bot.craft;bot.craft=async(...args)=>{calls++;await original(...args);controller.abort(new Error('stopped'))}
  const r=await craft.handler(bot,['oak_planks','2'],{bot},{signal:controller.signal});assert.equal(r.status,'cancelled');assert.equal(r.producedCount,4);assert.equal(calls,1)
  assert.equal(r.errorCode,'CANCELLED');assert.equal(r.effect,'observed');assert.ok(r.output.includes(JSON.stringify(r.changes)))
})
test('all six face normals and packet observation including negative chunk coordinates', async () => {
  for(let face=0;face<6;face++)assert.equal(aimedFace({face}).norm(),1)
  assert.throws(()=>aimedFace({face:99}))
  const bot=basic(),w=observeBlock(bot,new Vec3(-1,-1,-1))
  bot.emit('blockUpdate', null, { position: new Vec3(-1,-1,-1),stateId:5 })
  assert.equal(w.stateId,null)
  bot._client.emit('multi_block_change',{chunkCoordinates:{x:-1,y:-1,z:-1},records:[(5<<12)|(15<<8)|(15<<4)|15]})
  assert.equal(w.stateId,5);w.close();assert.equal(await waitFor(()=>false,undefined,1),false)
})
test('place uses aimed side and checks both block and inventory; entity placement checks consumption', async () => {
  const bot=basic(),p=new Vec3(0,0,0),block={name:'stone',position:p,face:5,intersect:new Vec3(1,0.6,0.4)};let current={stateId:0,type:0,name:'air'}
  bot.registry={blocksByName:{stone:{}}};bot.heldItem={name:'stone'};bot.inventory.slots[9]={name:'stone',count:2};bot.blockAtCursor=()=>block;bot.blockAt=()=>current
  bot._genericPlace=async(_,face,options)=>{assert.equal(face.x,1);assert.deepEqual(options.delta,block.intersect);assert.equal(options.forceLook,'ignore');current={stateId:1,type:1,name:'stone'};bot.inventory.slots[9].count--;bot._client.emit('block_change',{location:new Vec3(1,0,0),type:1})}
  assert.equal((await place.handler(bot,[],{})).confirmed,true)
  bot.heldItem={name:'painting'};assert.equal((await placeentity.handler(bot,[],{})).ok,false)
  bot.heldItem={name:'armor_stand'};bot.inventory.slots[9]={name:'armor_stand',count:1};bot._genericPlace=async()=>{bot.inventory.slots[9]=null;bot.emit('entitySpawn',{id:20,name:'armor_stand',position:new Vec3(1,0,0)})}
  assert.equal((await placeentity.handler(bot,[],{})).confirmed,true)
})

test('craft rejects ambiguous self-consuming output recipes and reports missing final confirmation', async () => {
  const {bot,recipe}=craftingBot()
  recipe.delta.push({id:recipe.result.id,count:-1})
  assert.equal((await craft.handler(bot,['oak_planks'],{bot})).ok,false)
  const second=craftingBot().bot;let snapshots=0
  second._syncWindow=async()=>{ if(++snapshots===3)throw Error('connection ended') }
  const r=await craft.handler(second,['oak_planks'],{bot:second})
  assert.equal(r.ok,false);assert.equal(r.changes,null);assert.deepEqual(r.evidence,[])
  assert.equal(r.phase,'confirmation');assert.equal(r.effect,'unknown');assert.equal(r.producedCount,null);assert.equal(r.errorCode,'CONFIRMATION_UNAVAILABLE')
})

test('craft input, open window and cursor rejection guarantee no execution effects', async () => {
  for(const args of [[],[''],[null],['oak_planks','65'],['oak_planks','2abc'],['oak_planks','1',''],['oak_planks','1','auto','0'],['oak_planks','1','auto','1','extra']]) {
    const r=await craft.handler({},args,{})
    assert.equal(r.errorCode,'INVALID_ARGUMENTS');assert.equal(r.phase,'preflight');assert.equal(r.effect,'none');assert.deepEqual(r.changes,[])
  }
  for(const [key,value,code] of [['currentWindow',{},'WINDOW_OPEN'],['cursor',{},'CURSOR_NOT_EMPTY']]) {
    const {bot}=craftingBot();if(key==='cursor')bot.inventory.selectedItem=value;else bot[key]=value
    bot._syncWindow=()=>{throw Error('must not sync')};bot.craft=()=>{throw Error('must not execute')}
    const r=await craft.handler(bot,['oak_planks'],{bot});assert.equal(r.errorCode,code);assert.deepEqual(r.changes,[])
  }
  assert.equal((await craft.handler(craftingBot().bot,['__proto__'],{})).errorCode,'UNKNOWN_ITEM')
})

test('craft initial sync failure is known not started, unlike final confirmation failure', async () => {
  const {bot}=craftingBot();bot._syncWindow=async()=>{throw Error('offline')}
  const r=await craft.handler(bot,['oak_planks'],{bot})
  assert.equal(r.errorCode,'INVENTORY_SYNC_FAILED');assert.equal(r.phase,'preflight');assert.equal(r.effect,'none');assert.deepEqual(r.changes,[]);assert.equal(r.producedCount,0)
})

test('an attempted craft with an empty final delta is an observed result, not a preflight guarantee', async () => {
  const {bot}=craftingBot();bot.craft=async()=>{throw Error('click rejected')}
  const r=await craft.handler(bot,['oak_planks'],{bot})
  assert.equal(r.errorCode,'CRAFT_EXECUTION_FAILED');assert.equal(r.phase,'execution');assert.equal(r.effect,'observed');assert.deepEqual(r.changes,[])
})

test('craft window-close failure retains observed effects and never retries', async () => {
  const {bot}=craftingBot(), original=bot.craft;let calls=0
  bot.craft=async(...args)=>{calls++;await original(...args);bot.currentWindow={...bot.inventory,type:'minecraft:crafting'}}
  bot.closeWindow=async()=>{throw Error('close failed')}
  const r=await craft.handler(bot,['oak_planks'],{bot})
  assert.equal(r.errorCode,'WINDOW_CLOSE_FAILED');assert.equal(r.producedCount,4);assert.equal(r.completedExecutions,1);assert.equal(r.effect,'observed');assert.equal(calls,1)
  assert.ok(r.output.includes(JSON.stringify(r.changes)))
})
