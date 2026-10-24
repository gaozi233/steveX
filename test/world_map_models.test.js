const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const {adapt,hashes}=require('../scripts/install-map-player-models')
const {defaultSkin,modelPlayers,startWorldMapPlayers}=require('../src/web/server/world_map_players')
const fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto')

test('pinned upstream is intact and adapter remains parseable with lifecycle and vsync guards',()=>{
  for(const [file,hash] of Object.entries(hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../vendor/bluemap-player-models',file))).digest('hex'),hash)
  const source=fs.readFileSync(path.join(__dirname,'../vendor/bluemap-player-models/player-models.js'),'utf8')
  const result=adapt(source)
  new vm.Script(result)
  for(const guard of ['app.mapViewer.redraw()','document.hidden','controller.abort()','instance.destroyed','inFlight = false','observedAt > 5000'])assert.ok(result.includes(guard),guard)
  assert.throws(()=>adapt(source.replace('const app = window.bluemap;','const app = null;')),/mismatch/)
})
function fixture(){
  const bot={game:{dimension:'overworld'},entity:{uuid:'00000000-0000-0000-0000-000000000001',position:{x:1,y:64,z:3},yaw:Math.PI,pitch:0},
    inventory:{slots:[]},getControlState:key=>key==='sneak',heldItem:{name:'diamond_sword',count:1},registry:{blocksByName:{}}}
  bot.inventory.slots[6]={name:'golden_chestplate',count:1};bot.inventory.slots[45]={name:'shield',count:1}
  return {bot,isOnline:()=>true,getUsername:()=>'A'}
}
test('appearance feed exports visible equipment, movement and crouch without private inventory',()=>{
  assert.deepEqual(defaultSkin('00000000-0000-0000-0000-000000000001'),{skinUrl:'assets/bluemap-player-models/skins/slim/ari.png',slim:true})
  const a=fixture(),m={agents:new Map([['a',a]])},previous=new WeakMap()
  a.bot.inventory.slots[10]={name:'diamond',count:64}
  let [p]=modelPlayers(m,'overworld','natural',previous,1000)
  assert.equal(p.equipment.chest.asset,'gold');assert.equal(p.equipment.offHand.id,'minecraft:shield')
  assert.equal(p.moving,false);assert.equal(p.crouching,true);assert.equal(p.yaw,0)
  assert.ok(!JSON.stringify(p).includes('minecraft:diamond"'))
  a.bot.entity.position.x+=1
  ;[p]=modelPlayers(m,'overworld','natural',previous,2000);assert.equal(p.moving,true)
  a.bot.entity.position.x+=100
  assert.equal(modelPlayers(m,'overworld','natural',previous,3000)[0].moving,false)
  a.bot.players={A:{skinData:{url:'http://textures.minecraft.net/texture/abcdef',model:'slim'}}}
  assert.equal(modelPlayers(m,'overworld','natural')[0].skinUrl,'https://textures.minecraft.net/texture/abcdef')
  a.bot.players.A.skinData.url='https://evil.example/key'
  assert.match(modelPlayers(m,'overworld','natural')[0].skinUrl,/^assets\//)
})
test('model publisher atomically exports and clears both feeds on shutdown',async t=>{
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'stevex-models-'))
  t.after(()=>fsp.rm(dir,{recursive:true,force:true}))
  const playersFile=path.join(dir,'live/players.json'),modelsFile=path.join(dir,'models/players.json')
  const warnings=[],manager={agents:new Map([['a',fixture()]]),config:{worldMap:{enabled:true,playersFile,modelsFile,mapId:'natural'}}}
  const publisher=startWorldMapPlayers(manager,e=>warnings.push(e));t.after(()=>publisher.close())
  for(let i=0;i<100;i++){try{if(JSON.parse(await fsp.readFile(modelsFile)).length)break}catch{}await new Promise(r=>setTimeout(r,10))}
  assert.equal(JSON.parse(await fsp.readFile(modelsFile))[0].maps[0],'natural')
  await publisher.close();assert.deepEqual(JSON.parse(await fsp.readFile(modelsFile)),[])
  assert.deepEqual(JSON.parse(await fsp.readFile(playersFile)),{players:[]});assert.deepEqual(warnings,[])
})
