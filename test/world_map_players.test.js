const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path')
const {livePlayers,startWorldMapPlayers}=require('../src/web/server/world_map_players')
function agent(id,dimension='overworld') {
  return {isOnline:()=>true,getUsername:()=>id,bot:{game:{dimension},entity:{uuid:'00000000-0000-0000-0000-00000000000'+id,position:{x:1,y:64,z:3},yaw:Math.PI,pitch:0}}}
}
test('map player output includes only online managed players in the selected dimension',()=>{
  const a=agent('1'),b=agent('2','the_nether'),c=agent('3');c.isOnline=()=>false
  const data=livePlayers({agents:new Map([['a',a],['b',b],['c',c]])})
  assert.equal(data.players.length,1);assert.equal(data.players[0].name,'1')
  assert.equal(data.players[0].rotation.yaw,0);assert.equal(data.players[0].foreign,false)
  a.bot.entity.position.x=NaN
  assert.equal(livePlayers({agents:new Map([['a',a]])}).players.length,0)
})
test('optional publisher writes BlueMap JSON and clears markers when closed',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stevex-map-players-'))
  t.after(()=>fs.rm(dir,{recursive:true,force:true}))
  const file=path.join(dir,'players.json'),manager={agents:new Map([['a',agent('1')]]),config:{worldMap:{enabled:true,playersFile:file}}}
  const errors=[],publisher=startWorldMapPlayers(manager,e=>errors.push(e))
  t.after(()=>publisher.close())
  for(let i=0;i<50;i++){try{if(JSON.parse(await fs.readFile(file)).players.length===1)break}catch{}await new Promise(r=>setTimeout(r,10))}
  assert.equal(JSON.parse(await fs.readFile(file)).players.length,1)
  await publisher.close();assert.deepEqual(JSON.parse(await fs.readFile(file)),{players:[]});assert.deepEqual(errors,[])
  assert.deepEqual(await fs.readdir(dir),['players.json'])
})
