const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{Vec3}=require('vec3')
const {handler}=require('../src/commands/mouse/rightclick')
const {aimedEntity}=require('../src/commands/rightclick_helpers')
const {controlBaseShapes}=require('../src/commands/rightclick_helpers')
const {loadCommands}=require('../src/commands'),{SteveXAgent}=require('../src/agent/agent')
function fixture(name='stone',hand='hand'){
 const bot=new EventEmitter(),packets=[],blocks=new Map(),slots=Array(46).fill(null)
 bot.entity={id:1,position:new Vec3(0.5,0,0.5),height:1.8,eyeHeight:1.62,yaw:0,pitch:0};bot.entities={1:bot.entity};bot.game={gameMode:'survival'}
 bot.registry={blocksByName:{stone:{},cobblestone:{}},entitiesByName:{cow:{}},foodsByName:{bread:{}}}
 bot.inventory={slots,items:()=>slots.slice(9,45).filter(Boolean)};bot.getEquipmentDestSlot=()=>45
 if(name)slots[hand==='off-hand'?45:36]={name,count:2,type:1,spawnEggMobName:name==='cow_spawn_egg'?'cow':undefined}
 Object.defineProperty(bot,'heldItem',{get:()=>slots[36]});bot._syncWindow=async()=>{}
 const target={name:'dirt',position:new Vec3(0,1,-2),stateId:1,face:3,intersect:new Vec3(0.5,1.62,-1),getProperties:()=>({})}
 blocks.set(target.position.toString(),target);blocks.set(new Vec3(0,1,-1).toString(),{name:'air',stateId:0,getProperties:()=>({})})
 bot.blockAt=p=>blocks.get(p.toString())||{name:'air',stateId:0,getProperties:()=>({})};bot.blockAtCursor=()=>target
 bot.getControlState=()=>false;bot.supportFeature=()=>true
 bot._client=Object.assign(new EventEmitter(),{write:(name,data)=>packets.push({name,data})})
 bot.activateItem=off=>{bot.usingHeldItem=true;packets.push({name:'use_item',data:{hand:off?1:0}})}
 bot.deactivateItem=()=>{bot.usingHeldItem=false;packets.push({name:'release'})}
 bot._genericPlace=async(block,face,options)=>{
  packets.push({name:'place',data:options});slots[options.offhand?45:36].count--
  const point=block.position.plus(face)
  if(name==='cow_spawn_egg')bot.emit('entitySpawn',{id:9,name:'cow',position:point.offset(0.5,0,0.5)})
  else{blocks.set(point.toString(),{name,stateId:2,getProperties:()=>({})});bot._client.emit('block_change',{location:point,type:2})}
 }
 return {bot,packets,slots,target,blocks}
}
test('rightclick replaces three old catalog entries without aliases',()=>{
 const {commands}=loadCommands();for(const name of ['place','placeentity','interact'])assert.equal(commands[name],undefined)
 for(const name of ['right','interactentity'])assert.equal(typeof commands[name],'function')
})
for(const hand of ['hand','off-hand'])for(const item of ['stone','cow_spawn_egg'])test(`${hand} ${item} reuses confirmed placement exactly once`,async()=>{
 const f=fixture(item,hand),r=await handler(f.bot,[hand],{})
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.confirmed,true);assert.equal(r.action,'rightclick');assert.equal(r.placementKind,item==='stone'?'block':'entity')
 assert.equal(r.changes.find(c=>c.item===item).delta,-1);assert.equal(f.packets.length,1);assert.equal(f.packets[0].data.offhand,hand==='off-hand')
})
test('interactive chest takes priority over held block and opens with one click',async()=>{
 const f=fixture();f.target.name='chest';f.bot.openBlock=async block=>{f.packets.push({name:'native-open',block});f.bot.currentWindow={type:'minecraft:generic_9x3'};f.bot.emit('windowOpen',f.bot.currentWindow);return f.bot.currentWindow}
 const r=await handler(f.bot,[],{});assert.equal(r.confirmed,true);assert.equal(r.route,'window-open');assert.equal(f.slots[36].count,2);assert.equal(f.packets.length,1)
})
test('sneaking with held item bypasses chest activation and uses placement path once',async()=>{
 const f=fixture();f.target.name='chest';f.bot.getControlState=()=>true
 const r=await handler(f.bot,[],{});assert.equal(r.route,'placement');assert.equal(f.packets.length,1)
})
test('offhand block activation is explicitly rejected instead of falsely confirming a window',async()=>{
 const f=fixture(null);f.target.name='chest';f.bot._client.write=(name,data)=>{f.packets.push({name,data});f.bot.emit('windowOpen',{type:'chest'})}
 assert.equal((await handler(f.bot,['off-hand'],{})).errorCode,'HAND_NOT_SUPPORTED');assert.equal(f.packets.length,0)
})
test('entity ray selects objects in front of block, never entities behind it',()=>{
 const f=fixture(null),boat={id:2,name:'oak_boat',type:'object',width:1,height:1.5,position:new Vec3(0.5,1,-0.2)}
 f.bot.entities[2]=boat;assert.equal(aimedEntity(f.bot,f.target).entity.id,2)
 boat.position=new Vec3(0.5,1,-4);assert.equal(aimedEntity(f.bot,f.target),null)
})
test('aimed cow interaction is request only, without item/placement fallback',async()=>{
 const f=fixture('wheat');f.bot.entities[2]={id:2,name:'cow',width:0.9,height:1.4,position:new Vec3(0.5,1,-0.2)}
 const r=await handler(f.bot,[],{});assert.equal(r.route,'entity-interaction');assert.equal(r.confirmed,false);assert.equal(r.confirmation,'request-sent-only');assert.equal(f.packets.length,1)
})
test('projectile rightclick at cow uses item rather than silently doing entity interaction',async()=>{
 const f=fixture('snowball');f.bot.entities[2]={id:2,name:'cow',width:0.9,height:1.4,position:new Vec3(0.5,1,-0.2)}
 const r=await handler(f.bot,[],{});assert.equal(r.route,'item-use');assert.deepEqual(f.packets.map(p=>p.name),['use_item','release'])
})
test('air click releases once and never repeats consumption; empty/no target rejects',async()=>{
 const f=fixture('bread');f.bot.blockAtCursor=()=>null
 const r=await handler(f.bot,[],{});assert.equal(r.confirmation,'request-sent-only');assert.equal(f.slots[36].count,2);assert.deepEqual(f.packets.map(p=>p.name),['use_item','release'])
 f.slots[36]=null;assert.equal((await handler(f.bot,[],{})).errorCode,'NO_TARGET')
})
test('invalid parameters and open windows never send a click',async()=>{
 const f=fixture();assert.equal((await handler(f.bot,['left'],{})).errorCode,'INVALID_ARGUMENTS');f.bot.currentWindow={}
 assert.equal((await handler(f.bot,[],{})).errorCode,'WINDOW_OPEN');assert.equal(f.packets.length,0)
})
test('rightclick refuses active use before Agent can implicitly release a bow',async()=>{
 const f=fixture('bow');f.bot.usingHeldItem=true
 const agent=new SteveXAgent({},'click-test',loadCommands().commands);agent.bot=f.bot;agent.connected=true
 agent.stopPhysicalActions=()=>{throw Error('must not release bow')}
 assert.equal((await agent.executeCommand('right click')).errorCode,'ITEM_ALREADY_IN_USE');assert.equal(f.packets.length,0)
})
test('non-colliding control selection uses small mounting bases, never full cubes',()=>{
 const lever={name:'lever',getProperties:()=>({face:'floor',facing:'north',powered:false})}
 assert.deepEqual(controlBaseShapes(lever),[[5/16,0,4/16,11/16,3/16,12/16]])
 const button={name:'stone_button',getProperties:()=>({face:'wall',facing:'north',powered:true})}
 assert.deepEqual(controlBaseShapes(button),[[5/16,6/16,15/16,11/16,10/16,1]])
})
test('failed placement never falls back or retries, and retains observed inventory loss',async()=>{
 const f=fixture();f.bot._genericPlace=async()=>{f.packets.push({name:'place'});f.slots[36].count--;throw Error('Interrupted after sending')}
 const r=await handler(f.bot,[],{});assert.equal(r.ok,false);assert.equal(r.action,'rightclick');assert.equal(r.changes[0].delta,-1)
 assert.equal(f.packets.length,1);assert.equal(f.bot._client.listenerCount('block_change'),0)
})
test('offhand entity and instant-item routes carry the selected protocol hand',async()=>{
 const entity=fixture('wheat','off-hand');entity.bot.entities[2]={id:2,name:'cow',width:0.9,height:1.4,position:new Vec3(0.5,1,-0.2)}
 assert.equal((await handler(entity.bot,['off-hand'],{})).route,'entity-interaction');assert.equal(entity.packets[0].data.hand,1)
 const item=fixture('snowball','off-hand');assert.equal((await handler(item.bot,['off-hand'],{})).route,'item-use');assert.equal(item.packets[0].data.hand,1)
})
