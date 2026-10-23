// Isolated local acceptance fixture; requires the existing test server and its ignored RCON helper.
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process')
const {Vec3}=require('vec3')
const {loadCommands}=require('../src/commands')
const {Brain}=require('../src/agent/brain')
const dir=path.resolve(__dirname,'../runs/api-acceptance-server'),name='API-Refine-Test',tag='api_refinement_fixture'
const rcon=c=>execFileSync(process.execPath,[path.join(dir,'rcon.cjs'),c],{encoding:'utf8',timeout:12000}).trim()
const delay=ms=>new Promise(r=>setTimeout(r,ms)),log={startedAt:new Date().toISOString(),cases:[]}
const {commands}=loadCommands()
let bot,fixtureStarted=false
async function call(name,args){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('Acceptance timeout')),12000)
  try{return await commands[name](bot,args,{bot},{signal:controller.signal})}finally{clearTimeout(timer)}
}
async function check(name,fn){const result=await fn();log.cases.push({name,result});console.log('PASS '+name)}
async function run(){
  rcon('list')
  bot=require('mineflayer').createBot({host:'127.0.0.1',port:25565,username:name,version:'1.21.11',auth:'offline'})
  await new Promise((resolve,reject)=>{bot.once('spawn',resolve);bot.once('error',reject)})
  bot.physicsEnabled=false
  rcon('forceload add 7400 7400 7406 7406');fixtureStarted=true
  rcon('fill 7400 99 7400 7406 99 7406 stone');rcon(`tp ${name} 7400.5 100 7402.5`)
  for(let i=0;i<150&&(!bot.entity||bot.entity.position.distanceTo(new Vec3(7400.5,100,7402.5))>5||!bot.blockAt(new Vec3(7402,99,7402)));i++)await delay(100)
  assert.ok(bot.blockAt(new Vec3(7402,99,7402)),'Fixture chunk must be received before testing')
  assert.ok(bot.entity.position.distanceTo(new Vec3(7400.5,100,7402.5))<5,'Fixture teleport must be received')
  await delay(300);bot.physicsEnabled=true
  rcon(`gamemode survival ${name}`);rcon(`effect give ${name} resistance 60 4 true`)
  rcon(`summon cow 7402.5 100 7402.5 {NoAI:1b,PersistenceRequired:1b,Tags:["${tag}"]}`);await delay(500)
  const cow=Object.values(bot.entities).find(e=>e.name==='cow'&&e.position.distanceTo(bot.entity.position)<4)
  assert.ok(cow)
  await check('attack confirms self-attributed hit and actual server health reduction',async()=>{
    const before=rcon(`data get entity @e[tag=${tag},limit=1] Health`)
    const result=await call('attack',[String(cow.id)])
    const after=rcon(`data get entity @e[tag=${tag},limit=1] Health`)
    assert.equal(result.hit,true,JSON.stringify(result));assert.notEqual(before,after)
    return {result,before,after}
  })
  await check('off-hand assisted interaction consumes wheat and server confirms cow love state',async()=>{
    rcon(`item replace entity ${name} weapon.offhand with wheat 2`);await delay(250)
    const result=await call('interactentity',[String(cow.id),'normal','off-hand'])
    assert.equal(result.hand,'off-hand');assert.equal(result.status,'requested');await delay(300)
    const love=rcon(`data get entity @e[tag=${tag},limit=1] InLove`)
    assert.match(love,/\b[1-9]\d*\b/);await bot._syncWindow(bot.inventory)
    assert.equal(bot.inventory.slots[45].count,1)
    return {result,love,offhandCount:1}
  })
  await delay(1200);rcon(`data merge entity @e[tag=${tag},limit=1] {Invulnerable:1b}`);await delay(200)
  await check('invulnerable target stays unconfirmed rather than reporting a hit or false miss',async()=>{
    const result=await call('attack',[String(cow.id)]);assert.equal(result.hit,null);assert.equal(result.confirmed,false);return result
  })
  rcon(`kill @e[tag=${tag}]`)
  for(let i=0;i<30&&bot.entities[cow.id];i++)await delay(100)
  assert.equal(bot.entities[cow.id],undefined,'Dead target must leave client entity cache before chest raycast')
  rcon('setblock 7402 100 7402 chest');rcon(`clear ${name}`)
  rcon(`item replace entity ${name} inventory.0 with stone 8`)
  rcon(`item replace entity ${name} inventory.1 with dirt 3`)
  rcon(`item replace entity ${name} inventory.2 with stone[custom_name={text:"variant"}] 2`)
  await delay(600);await bot.lookAt(new Vec3(7402.5,100.5,7402.5),true)
  const opened=await call('right',['click'])
  assert.equal(opened.confirmed,true,JSON.stringify(opened))
  const start=bot.currentWindow.inventoryStart
  await check('partial moveslot reports source and destination counts',async()=>{
    const r=await call('moveslot',[String(start),'0','3']);assert.equal(r.confirmed,true,JSON.stringify(r))
    assert.equal(bot.currentWindow.slots[start].count,5);assert.equal(bot.currentWindow.slots[0].count,3)
    assert.match(rcon('data get block 7402 100 7402 Items'),/stone/);return r
  })
  await check('deposit and withdraw use explicit source slot and count',async()=>{
    const deposit=await call('transfer',['deposit',String(start),'2']);assert.equal(deposit.confirmed,true,JSON.stringify(deposit))
    const withdraw=await call('transfer',['withdraw','0','1']);assert.equal(withdraw.confirmed,true,JSON.stringify(withdraw))
    return {deposit,withdraw,server:rcon('data get block 7402 100 7402 Items')}
  })
  await check('different component variant cannot merge into ordinary stone',async()=>{
    const r=await call('moveslot',[String(start+2),'0','1']);assert.equal(r.errorCode,'DESTINATION_MISMATCH');return r
  })
  await check('omitted moveslot count swaps different stacks',async()=>{
    const r=await call('moveslot',[String(start+1),'0']);assert.equal(r.confirmed,true,JSON.stringify(r));assert.equal(r.mode,'swap')
    assert.equal(bot.currentWindow.slots[0].name,'dirt');return r
  })
  await check('right slot click splits stack and reports cursor; left places it',async()=>{
    const split=await call('slotclick',['0','right']);assert.equal(split.confirmed,true,JSON.stringify(split));assert.ok(bot.currentWindow.selectedItem)
    const place=await call('slotclick',['1','left']);assert.equal(place.confirmed,true,JSON.stringify(place));assert.equal(bot.currentWindow.selectedItem,null)
    return {split,place}
  })
  await check('shift-left native quick move and putaway report actual slots',async()=>{
    const shift=await call('slotclick',['1','shift-left']);assert.equal(shift.confirmed,true,JSON.stringify(shift))
    const putaway=await call('putaway',['0']);assert.equal(putaway.confirmed,true,JSON.stringify(putaway));return {shift,putaway}
  })
  await check('full container rejects deposit before consuming player stack',async()=>{
    await call('close',[])
    for(let i=0;i<27;i++)rcon(`item replace block 7402 100 7402 container.${i} with cobblestone 64`)
    await bot.lookAt(new Vec3(7402.5,100.5,7402.5),true);await call('right',['click'])
    const slot=bot.currentWindow.slots.findIndex((i,n)=>n>=start&&i?.name==='stone')
    assert.ok(slot>=start)
    const before=bot.currentWindow.slots[slot].count,r=await call('transfer',['deposit',String(slot),'1'])
    assert.equal(r.errorCode,'DESTINATION_FULL');assert.equal(bot.currentWindow.slots[slot].count,before);assert.deepEqual(r.changes,[])
    return r
  })
  await check('storage transfer catalog disappears after close',async()=>{
    const brain=new Brain({bot},{},{});assert.equal(brain.commandNames.has('transfer'),true)
    await call('close',[]);brain.buildSystem();assert.equal(brain.commandNames.has('transfer'),false)
    return {closed:true}
  })
  await check('collect explicitly selects farther dropped-item id without choosing nearer other items',async()=>{
    rcon('setblock 7402 100 7402 air');rcon(`tp ${name} 7400.5 100 7402.5`);await delay(500)
    const {pathfinder,Movements}=require('mineflayer-pathfinder');bot.loadPlugin(pathfinder)
    const movements=new Movements(bot)
    rcon(`summon item 7403.5 100 7405.5 {Item:{id:"minecraft:wheat",count:1},NoGravity:1b,PickupDelay:0s,Tags:["${tag}"]}`)
    rcon(`summon item 7404.5 100 7402.5 {Item:{id:"minecraft:diamond",count:2},NoGravity:1b,PickupDelay:0s,Tags:["${tag}"]}`)
    await delay(500)
    const target=Object.values(bot.entities).find(e=>e.name==='item'&&e.getDroppedItem?.()?.name==='diamond'&&e.position.distanceTo(bot.entity.position)<8)
    assert.ok(target)
    const result=await commands.collect(bot,[String(target.id)],{bot,movements},{signal:AbortSignal.timeout(15000)})
    if(!result.confirmed)result.fixture={position:bot.entity.position,target:target.position,ground:bot.blockAt(new Vec3(7401,99,7402))?.name}
    assert.equal(result.confirmed,true,JSON.stringify(result));assert.equal(result.target.entityId,target.id)
    assert.ok(result.changes.some(i=>i.item==='diamond'&&i.delta===2));return result
  })
}
run().catch(e=>{log.error=e.stack;process.exitCode=1}).finally(async()=>{
  if(bot){try{if(bot.currentWindow)bot.closeWindow(bot.currentWindow);bot.quit()}catch{}}
  if(fixtureStarted)try {
    rcon(`kill @e[tag=${tag}]`);rcon('kill @e[type=item,x=7400,y=99,z=7400,dx=6,dy=4,dz=6]')
    rcon('fill 7400 99 7400 7406 102 7406 air');rcon('forceload remove 7400 7400 7406 7406')
  }catch(e){log.cleanupError=e.message;process.exitCode=1}
  const file=path.join(dir,`api-refinement-${Date.now()}.json`);fs.writeFileSync(file,JSON.stringify(log,null,2))
  console.log(JSON.stringify({passed:log.cases.length,error:log.error||null,cleanupError:log.cleanupError||null,file}))
})
