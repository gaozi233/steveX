const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{Vec3}=require('vec3')
const commands={fish:require('../src/commands/actions/fish').handler,pos:require('../src/commands/queries/pos').handler},queryNames=new Set(['pos'])
const {SteveXAgent}=require('../src/agent/agent')
function fixture(){
  const bot=Object.assign(new EventEmitter(),{entity:{id:1,position:new Vec3(0,64,0)},game:{dimension:'overworld'},_client:new EventEmitter(),heldItem:{name:'fishing_rod'},quickBarSlot:0,entities:{},
    registry:{entitiesByName:{fishing_bobber:{id:150}},supportFeature:()=>true},supportFeature:()=>true}),calls=[]
  const spawn=(id=10,owner=1)=>{bot.entities[id]={id,position:new Vec3(1,64,1)};bot._client.emit('spawn_entity',{type:150,entityId:id,objectData:owner})}
  bot.activateItem=()=>{calls.push('use');if(calls.length===1)spawn();else queueMicrotask(()=>{bot._client.emit('entity_destroy',{entityIds:[10]});delete bot.entities[10]})}
  bot.fish=()=>assert.fail('Do not leave global native fishing task running')
  const bite=()=>bot._client.emit('world_particles',{particle:{type:'fishing'},amount:6,x:1,z:1})
  const clean=()=>{for(const event of ['spawn_entity','world_particles','entity_destroy'])assert.equal(bot._client.listenerCount(event),0);for(const event of ['end','death','heldItemChanged'])assert.equal(bot.listenerCount(event),0)}
  return {bot,calls,spawn,bite,clean}
}
test('fishing reuses upstream bite detection in a scoped session and never claims caught inventory',async()=>{
  const f=fixture(),pending=commands.fish(f.bot,[],null,{timeoutMs:2000});f.bite()
  const r=await pending;assert.equal(r.ok,true);assert.equal(r.reelRequested,true);assert.equal(r.confirmed,false);assert.equal(r.catchConfirmed,false)
  assert.equal(r.cleanup.bobberRemovalConfirmed,true);assert.deepEqual(f.calls,['use','use']);f.clean();f.bite();assert.equal(f.calls.length,2)
})
test('fishing cancellation retracts observed own bobber, releases queue and cannot reel again later',async()=>{
  const f=fixture(),agent=new SteveXAgent({},'fish-cancel',commands,{queryNames});agent.bot=f.bot;agent.connected=true
  const controller=new AbortController(),action=agent.executeCommand('fish',{signal:controller.signal})
  await new Promise(resolve=>setImmediate(resolve));controller.abort();assert.equal((await action).errorCode,'CANCELLED')
  assert.equal((await agent.executeCommand('pos')).ok,true)
  assert.equal(f.calls.length,2);f.clean();f.bite();assert.equal(f.calls.length,2)
})
test('fish timeout is bounded even without a bobber spawn and never blind-recasts',async()=>{
  const f=fixture();f.bot.activateItem=()=>f.calls.push('use')
  const r=await commands.fish(f.bot,[],null,{timeoutMs:10})
  assert.equal(r.errorCode,'FISH_TIMEOUT');assert.equal(r.cleanup.bobberRemovalConfirmed,false);assert.deepEqual(f.calls,['use']);f.clean()
})
test('other players bobbers cannot trigger own reeling',async()=>{
  const f=fixture();f.bot.activateItem=()=>{f.calls.push('use');f.spawn(20,99)}
  const task=commands.fish(f.bot,[],null,{timeoutMs:10});f.bite()
  const r=await task;assert.equal(r.errorCode,'FISH_TIMEOUT');assert.equal(r.bobberId,null);assert.equal(f.calls.length,1);f.clean()
})
test('late owned spawn during cancellation cleanup is retracted before operation settles',async()=>{
  const f=fixture(),controller=new AbortController();f.bot.activateItem=()=>{f.calls.push('use');if(f.calls.length===2)queueMicrotask(()=>f.bot._client.emit('entity_destroy',{entityIds:[10]}))}
  const task=commands.fish(f.bot,[],null,{signal:controller.signal});controller.abort();setTimeout(()=>f.spawn(),10)
  const r=await task;assert.equal(r.errorCode,'CANCELLED');assert.equal(r.cleanup.retractionRequested,true);assert.equal(r.cleanup.bobberRemovalConfirmed,true);assert.equal(f.calls.length,2);f.clean()
})
test('disconnect stops session without sending cleanup packets on a dead connection',async()=>{
  const f=fixture(),task=commands.fish(f.bot,[]);f.bot.emit('end')
  const r=await task;assert.equal(r.errorCode,'DISCONNECTED');assert.equal(f.calls.length,1);f.clean()
})
test('switching away from rod cancels without using new item',async()=>{
  const f=fixture(),task=commands.fish(f.bot,[]);f.bot.heldItem={name:'shield'};f.bot.emit('heldItemChanged',f.bot.heldItem)
  const r=await task;assert.equal(r.errorCode,'ITEM_CHANGED');assert.equal(f.calls.length,1);f.clean()
})
test('pre-aborted fishing and invalid arguments send nothing',async()=>{
  const f=fixture(),controller=new AbortController();controller.abort()
  assert.equal((await commands.fish(f.bot,[],null,{signal:controller.signal})).ok,false)
  assert.equal((await commands.fish(f.bot,['extra'])).errorCode,'INVALID_ARGUMENTS');assert.equal(f.calls.length,0);f.clean()
})
