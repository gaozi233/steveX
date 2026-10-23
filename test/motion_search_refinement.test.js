const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3')
const {SteveXAgent}=require('../src/agent/agent')
const commands=Object.fromEntries(['move','goto'].map(name=>[name,require(`../src/commands/actions/${name}`).handler]))
commands.findblock=require('../src/commands/queries/findblock').handler
test('move sprint holds forward and sprint together and releases both',async()=>{
  const calls=[],bot={setControlState:(...args)=>calls.push(args)}
  const r=await commands.move(bot,['sprint','5'])
  assert.deepEqual(calls,[['forward',true],['sprint',true],['sprint',false],['forward',false]])
  assert.deepEqual(r.controls,['forward','sprint'])
})
test('move sprint cancellation releases both keys without touching persistent sneak or item use',async()=>{
  const controller=new AbortController(),controls={sneak:true},bot={setControlState:(k,v)=>{controls[k]=v}}
  const task=commands.move(bot,['sprint','30000'],null,{signal:controller.signal})
  assert.equal(controls.forward,true);assert.equal(controls.sprint,true);controller.abort()
  assert.equal((await task).errorCode,'CANCELLED')
  assert.deepEqual(controls,{sneak:true,forward:false,sprint:false})
})
test('pre-aborted sprint sends no controls and vehicle sprint remains rejected',async()=>{
  const controller=new AbortController();controller.abort();let calls=0
  const bot={setControlState:()=>calls++}
  assert.equal((await commands.move(bot,['sprint','5'],null,{signal:controller.signal})).ok,false)
  bot.vehicle={};assert.equal((await commands.move(bot,['sprint','5'])).errorCode,'UNSUPPORTED_CONTROL');assert.equal(calls,0)
})
test('sprint still releases forward if releasing sprint raises a network error',async()=>{
  const calls=[],bot={setControlState:(key,value)=>{calls.push([key,value]);if(key==='sprint'&&!value)throw Error('disconnected')}}
  assert.equal((await commands.move(bot,['sprint','1'])).ok,false)
  assert.deepEqual(calls.slice(-2),[['sprint',false],['forward',false]])
})
test('goto resolves mixed ~ coordinates from current feet before flooring negative goals',async()=>{
  const bot={entity:{position:new Vec3(-0.2,64.8,4.3)},pathfinder:{goto:async goal=>{assert.deepEqual([goal.x,goal.y,goal.z],[-2,64,10]);bot.entity.position=new Vec3(-1.5,64,10.5)}}}
  const r=await commands.goto(bot,['~-1','~','10.9'],{bot,movements:{}})
  assert.equal(r.ok,true);assert.deepEqual(r.target,{x:-2,y:64,z:10})
})
test('goto relative coordinates resolve at dequeue, not when command is submitted',async()=>{
  const agent=new SteveXAgent({},'relative-goal',commands)
  let unblock,goal
  const before=agent.executor.run('fixture',()=>new Promise(resolve=>{unblock=resolve}))
  await Promise.resolve()
  agent.bot={entity:{position:new Vec3(1,64,1)},pathfinder:{goto:async value=>{goal=value;agent.bot.entity.position=new Vec3(value.x+0.5,value.y,value.z+0.5)}}}
  agent.connected=true;agent.movements={}
  const action=agent.executeCommand('goto ~1 ~ ~-2')
  agent.bot.entity.position=new Vec3(10.8,70.2,-2.2);unblock();await before
  assert.equal((await action).ok,true);assert.deepEqual([goal.x,goal.y,goal.z],[11,70,-5])
})
test('goto rejects malformed relative coordinates before game access and missing bases before pathfinding',async()=>{
  for(const value of ['^1','~~1','~Infinity','~0x10','~1x','~9007199254740992'])assert.equal((await commands.goto({},[value,'~','~'],{})).errorCode,'INVALID_ARGUMENTS')
  assert.equal((await commands.goto({entity:{}},['~','~','~'],{movements:{}})).errorCode,'STATE_UNAVAILABLE')
  const bot={entity:{position:new Vec3(Number.MAX_SAFE_INTEGER,0,0)}}
  assert.equal((await commands.goto(bot,['~1','0','0'],{bot,movements:{}})).errorCode,'STATE_UNAVAILABLE')
})
test('findblock count returns sorted candidates with actual properties, without deduplicating bed parts',async()=>{
  let options
  const positions=[new Vec3(3,64,0),new Vec3(1,64,0),new Vec3(2,64,0)]
  const bot={version:'1.21.11',entity:{position:new Vec3(0,64,0)},findBlocks:input=>{options=input;return positions},
    blockAt:p=>({name:'red_bed',position:p,getProperties:()=>({part:p.x===1?'head':'foot',occupied:p.x===2})})}
  const r=await commands.findblock(bot,['red_bed','16','3'],{bot})
  assert.equal(options.count,3);assert.equal(r.returned,3);assert.deepEqual(r.blocks.map(b=>b.position.x),[1,2,3])
  assert.equal(r.blocks[1].properties.occupied,true);assert.equal(r.block,undefined);assert.match(r.output,/not a total match count/)
})
test('findblock default singleton fields remain compatible and empty multi-results are explicit',async()=>{
  const bot={version:'1.21.11',entity:{position:new Vec3(0,64,0)},findBlock:()=>({name:'stone',position:new Vec3(1,64,0)}),findBlocks:()=>[]}
  const one=await commands.findblock(bot,['stone'],{bot});assert.equal(one.block,'stone');assert.equal(one.count,1);assert.equal(one.returned,1);assert.deepEqual(one.blocks[0].position,one.position)
  const empty=await commands.findblock(bot,['stone','16','5'],{bot});assert.equal(empty.found,false);assert.deepEqual(empty.blocks,[]);assert.equal(empty.returned,0)
})
test('findblock validates count before accessing world and directory modes never accept count',async()=>{
  for(const n of ['0','17','1.5','2x','Infinity'])assert.equal((await commands.findblock({},['stone','32',n],{})).errorCode,'INVALID_ARGUMENTS')
  for(const args of [['tags','logs','2'],['tag','#logs','2']])assert.equal((await commands.findblock({},args,{})).errorCode,'INVALID_ARGUMENTS')
})
