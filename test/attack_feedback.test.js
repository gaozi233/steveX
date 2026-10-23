const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{Vec3}=require('vec3')
const {commands}=require('../src/commands').loadCommands()
function fixture(){
  const self={id:1,position:new Vec3(0,0,0)},target={id:2,name:'zombie',height:1.8,position:new Vec3(0,0,2)}
  const bot={entity:self,entities:{1:self,2:target},_client:new EventEmitter(),world:{raycast:()=>null},lookAt:async()=>{}}
  bot.attack=async()=>bot._client.emit('damage_event',{entityId:2,sourceCauseId:2})
  return {bot,target}
}
test('attack only confirms server damage to selected entity attributed to self',async()=>{
  const f=fixture(),r=await commands.attack(f.bot,['2'])
  assert.equal(r.hit,true);assert.equal(r.confirmed,true);assert.equal(r.target.id,2);assert.equal(f.bot._client.listenerCount('damage_event'),0)
})
test('hurt from another source or animation alone is unknown, never a confirmed miss',async()=>{
  const f=fixture();f.bot.attack=async()=>{f.bot._client.emit('damage_event',{entityId:2,sourceCauseId:99});f.bot._client.emit('damage_event',{entityId:99,sourceCauseId:2})}
  const r=await commands.attack(f.bot,['zombie']);assert.equal(r.ok,true);assert.equal(r.hit,null);assert.equal(r.confirmed,false);assert.equal(r.status,'requested')
})
test('attack rejects missing target, distant target and obstruction without sending',async()=>{
  const f=fixture();f.bot.attack=()=>{throw Error('must not attack')}
  assert.equal((await commands.attack(f.bot,[])).errorCode,'INVALID_ARGUMENTS')
  assert.equal((await commands.attack(f.bot,[])).hit,false)
  assert.equal((await commands.attack(f.bot,['cow'])).hit,false)
  f.target.position=new Vec3(0,0,10);assert.equal((await commands.attack(f.bot,['2'])).errorCode,'ENTITY_OUT_OF_REACH')
  f.target.position=new Vec3(0,0,2);f.bot.world.raycast=()=>({});assert.equal((await commands.attack(f.bot,['2'])).errorCode,'ENTITY_OBSTRUCTED')
})
test('attack rechecks target after turning and cleans listeners on cancellation',async()=>{
  const f=fixture();f.bot.lookAt=async()=>{delete f.bot.entities[2]}
  assert.equal((await commands.attack(f.bot,['2'])).errorCode,'TARGET_CHANGED')
  const g=fixture(),controller=new AbortController();g.bot.attack=async()=>controller.abort()
  const r=await commands.attack(g.bot,['2'],null,{signal:controller.signal});assert.equal(r.errorCode,'CANCELLED');assert.equal(r.hit,null);assert.equal(g.bot._client.listenerCount('damage_event'),0)
})
test('registered attack skill uses the same explicit-target validation',async()=>{
  const skill=require('../src/runtime/skill_registry.ts').get('attack')
  assert.equal(skill.args.target.required,true)
  assert.equal((await skill.handler({},[])).errorCode,'INVALID_ARGUMENTS')
})
test('assisted entity interaction sends off-hand once and preserves sneak',async()=>{
  const f=fixture(),calls=[];f.target.name='cow';f.bot.getControlState=()=>true;f.bot._client.write=(...a)=>calls.push(a)
  const r=await commands.interactentity(f.bot,['2','at','off-hand'])
  assert.equal(r.hand,'off-hand');assert.equal(r.status,'requested');assert.equal(r.confirmed,false);assert.equal(calls.length,1)
  assert.equal(calls[0][1].hand,1);assert.equal(calls[0][1].sneaking,true);assert.equal(calls[0][1].mouse,2)
})
test('wake and respawn are state-exposed, even for explicit allowlists, with live execution gates',async()=>{
  const {Brain}=require('../src/agent/brain'),agent={bot:{health:20}},brain=new Brain(agent,{},{},{allowedCommands:['wake','respawn']})
  assert.equal(brain.commandNames.size,0);agent.bot.isSleeping=true;brain.buildSystem();assert.deepEqual([...brain.commandNames],['wake'])
  agent.bot.isSleeping=false;agent.bot.health=0;brain.buildSystem();assert.deepEqual([...brain.commandNames],['respawn'])
  assert.equal((await commands.wake({isSleeping:false},[])).errorCode,'NOT_SLEEPING');assert.equal((await commands.respawn({health:20},[])).errorCode,'NOT_DEAD')
})
