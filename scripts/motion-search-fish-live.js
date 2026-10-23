// Isolated acceptance only; no model calls or GUI. RCON credentials stay in ignored local files.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process')
const {Vec3}=require('vec3'),{SteveXAgent}=require('../src/agent/agent')
const dir=path.resolve(__dirname,'../runs/api-acceptance-server'),name='Motion-Fish-Test'
const rcon=c=>execFileSync(process.execPath,[path.join(dir,'rcon.cjs'),c],{encoding:'utf8',timeout:10000}).trim()
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),report={startedAt:new Date().toISOString(),cases:[]}
const commands=Object.fromEntries(['move','goto','fish'].map(n=>[n,require(`../src/commands/actions/${n}`).handler]))
commands.findblock=require('../src/commands/queries/findblock').handler;commands.pos=require('../src/commands/queries/pos').handler
let bot,agent,prepared=false
async function check(name,fn){const result=await fn();report.cases.push({name,result});console.log('PASS '+name)}
async function tp(x,y,z){rcon(`tp ${name} ${x} ${y} ${z}`);for(let i=0;i<40&&bot.entity.position.distanceTo(new Vec3(x,y,z))>1;i++)await delay(50);await delay(250)}
async function command(input,options={}){return agent.executeCommand(input,{timeoutMs:10000,...options})}
async function run(){
  for(let i=0;i<30;i++){try{rcon('list');break}catch{await delay(500)}}
  bot=require('mineflayer').createBot({host:'127.0.0.1',port:25565,username:name,version:'1.21.11',auth:'offline'})
  require('../src/agent/block_tags').attachBlockTags(bot)
  bot.loadPlugin(require('../src/agent/velocity_compat').velocityCompatibility)
  bot.loadPlugin(require('../src/agent/spectator_compat').spectatorCompatibility)
  await new Promise((resolve,reject)=>{bot.once('spawn',resolve);bot.once('error',reject)})
  bot.physicsEnabled=false
  rcon('forceload add 7798 7798 7820 7820');prepared=true
  rcon('fill 7798 99 7798 7820 99 7820 stone');await tp(7801.5,100,7801.5)
  for(let i=0;i<100&&!bot.blockAt(new Vec3(7801,99,7801));i++)await delay(100)
  assert.ok(bot.blockAt(new Vec3(7801,99,7801)));bot.physicsEnabled=true
  const {pathfinder,Movements}=require('mineflayer-pathfinder');bot.loadPlugin(pathfinder)
  agent=new SteveXAgent({},name,commands,{queryNames:new Set(['pos','findblock'])});agent.bot=bot;agent.connected=true;agent.movements=new Movements(bot)
  bot.pathfinder.setMovements(agent.movements)
  rcon(`gamemode survival ${name}`);rcon(`effect give ${name} saturation 2 5 true`);await delay(250)
  await check('sprint moves forward farther than walk over same interval and releases both keys',async()=>{
    await tp(7801.5,100,7801.5);await delay(500)
    await bot.look(Math.PI,0,true)
    const before=bot.entity.position.clone(),walk=await command('move forward 900');await delay(200)
    const walkEnd=bot.entity.position.clone(),walkDistance=Math.hypot(walkEnd.x-before.x,walkEnd.z-before.z)
    await tp(7801.5,100,7801.5);await delay(500);await bot.look(Math.PI,0,true)
    const start=bot.entity.position.clone(),sprint=await command('move sprint 900');await delay(200)
    const sprintEnd=bot.entity.position.clone(),sprintDistance=Math.hypot(sprintEnd.x-start.x,sprintEnd.z-start.z)
    assert.equal(walk.ok,true);assert.equal(sprint.ok,true);assert.ok(sprintDistance>walkDistance*1.1,JSON.stringify({walkDistance,sprintDistance,before,walkEnd,start,sprintEnd}))
    assert.equal(bot.getControlState('forward'),false);assert.equal(bot.getControlState('sprint'),false)
    return {walkDistance,sprintDistance,sprint,serverPosition:rcon(`data get entity ${name} Pos`)}
  })
  await check('sprint cancellation releases forward and sprint and next action runs',async()=>{
    await tp(7801.5,100,7801.5)
    const controller=new AbortController(),task=command('move sprint 30000',{signal:controller.signal})
    setTimeout(()=>controller.abort(),200);const result=await task
    assert.equal(result.errorCode,'CANCELLED');assert.equal(bot.getControlState('forward'),false);assert.equal(bot.getControlState('sprint'),false)
    assert.equal((await command('pos')).ok,true);return result
  })
  await check('goto resolves relative coordinates and arrival agrees with server',async()=>{
    await tp(7801.5,100,7801.5)
    const result=await command('goto ~3 ~ ~1')
    assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(result.target,{x:7804,y:100,z:7802})
    return {result,serverPosition:rcon(`data get entity ${name} Pos`)}
  })
  for(const [x,z,block]of [[7805,7804,'oak_log[axis=x]'],[7807,7804,'birch_log[axis=y]'],[7809,7804,'spruce_log[axis=z]']])rcon(`setblock ${x} 100 ${z} ${block}`)
  for(const [x,z,color]of [[7807,7807,'red'],[7810,7807,'white']]){
    rcon(`setblock ${x} 100 ${z} ${color}_bed[facing=east,part=foot]`);rcon(`setblock ${x+1} 100 ${z} ${color}_bed[facing=east,part=head]`)
  }
  await delay(300)
  await check('findblock native logs returns three sorted actual block states',async()=>{
    const result=await command('findblock #minecraft:logs 16 3')
    assert.equal(result.returned,3,JSON.stringify(result));assert.equal(new Set(result.blocks.map(b=>b.block)).size,3)
    for(const b of result.blocks){assert.ok(b.properties.axis);assert.match(rcon(`execute if block ${b.position.x} ${b.position.y} ${b.position.z} ${b.block}[axis=${b.properties.axis}] run data get entity ${name} Pos`),/entity data/)}
    assert.ok(result.blocks.every((b,i,a)=>i===0||b.distance>=a[i-1].distance));return result
  })
  await check('findblock beds keeps both colors and head/foot as separate candidates',async()=>{
    const result=await command('findblock #minecraft:beds 16 4')
    assert.equal(result.returned,4,JSON.stringify(result));assert.equal(new Set(result.blocks.map(b=>b.block)).size,2)
    assert.equal(result.blocks.filter(b=>b.properties.part==='head').length,2);return result
  })
  await check('default findblock remains a singleton and multi-result empty search is explicit',async()=>{
    const one=await command('findblock oak_log 16');assert.equal(one.returned,1);assert.equal(one.block,'oak_log')
    const none=await command('findblock diamond_block 8 4');assert.equal(none.found,false);assert.deepEqual(none.blocks,[])
    return {one,none}
  })
  rcon('fill 7803 97 7809 7815 99 7819 stone');rcon('fill 7804 98 7810 7814 99 7818 water')
  rcon(`item replace entity ${name} weapon.mainhand with fishing_rod 1`)
  await tp(7802.5,100,7814.5);await bot.lookAt(new Vec3(7806.5,99.8,7814.5),true);await delay(300)
  await check('fish cancellation retracts owned water bobber, clears session and leaves queue usable',async()=>{
    const controller=new AbortController(),task=command('fish',{signal:controller.signal})
    await delay(600);controller.abort();const result=await task
    assert.equal(result.errorCode,'CANCELLED',JSON.stringify(result));assert.ok(result.bobberId!==null)
    assert.equal(result.cleanup.retractionRequested,true);assert.equal(result.cleanup.bobberRemovalConfirmed,true,JSON.stringify(result))
    assert.equal((await command('pos')).ok,true);return result
  })
  await check('fish timeout over dry ground is bounded, retracts bobber and permits another action',async()=>{
    await tp(7801.5,100,7801.5);await bot.lookAt(new Vec3(7801.5,99,7802.5),true)
    const start=Date.now(),result=await commands.fish(bot,[],agent,{timeoutMs:900})
    assert.equal(result.errorCode,'FISH_TIMEOUT',JSON.stringify(result));assert.ok(Date.now()-start<4000)
    assert.equal(result.cleanup.bobberRemovalConfirmed,true,JSON.stringify(result));assert.equal((await command('pos')).ok,true)
    return result
  })
}
run().catch(error=>{report.error=error.stack;process.exitCode=1}).finally(()=>{
  if(bot){bot.pathfinder?.setGoal(null);bot.quit()}
  if(prepared)try{
    rcon('fill 7798 97 7798 7820 103 7820 air');rcon('kill @e[type=item,x=7798,y=97,z=7798,dx=22,dy=7,dz=22]')
    rcon('forceload remove 7798 7798 7820 7820')
  }catch(error){report.cleanupError=error.message;process.exitCode=1}
  const file=path.join(dir,`motion-search-fish-${Date.now()}.json`);fs.writeFileSync(file,JSON.stringify(report,null,2))
  console.log(JSON.stringify({passed:report.cases.length,error:report.error||null,cleanupError:report.cleanupError||null,file}))
})
