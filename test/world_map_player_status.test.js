const test=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events')
const express=require('express'),{registerWorldMapRoutes}=require('../src/web/server/world_map')
test('World player status maps UUID to agent name and exposes only small display fields',async t=>{
  const uuid='00000000-0000-0000-0000-000000000001'
  let online=true
  const agent={bot:{entity:{uuid}},isOnline:()=>online,getUsername:()=>'MinecraftName',brain:{secret:'not exported'}}
  const manager={config:{worldMap:{enabled:true}},agents:new Map([['Agent / A',agent]]),
    getAgentHealth:()=>({health:15,maxHealth:24}),getAgentGameMode:()=>'creative',
    getAgentPosition:()=>({x:'-0.1',y:'64.0',z:'3.2'}),getAgentAction:()=>'move forward'}
  const app=express();registerWorldMapRoutes(app,manager)
  const server=app.listen(0,'127.0.0.1');await once(server,'listening')
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))})
  const url='http://127.0.0.1:'+server.address().port+'/api/world-map/players/'
  const response=await fetch(url+uuid),data=await response.json()
  assert.equal(response.headers.get('cache-control'),'no-store')
  assert.equal(data.player.name,'Agent / A');assert.equal(data.player.username,'MinecraftName')
  assert.equal(data.player.health,15);assert.equal(data.player.gameMode,'creative')
  assert.equal(data.player.currentAction,'move forward');assert.ok(!JSON.stringify(data).includes('secret'))
  assert.equal((await fetch(url+'invalid')).status,404)
  assert.equal((await fetch(url+uuid.replace(/1$/,'2'))).status,404)
  online=false;const offline=await(await fetch(url+uuid)).json()
  assert.equal(offline.player.health,null);assert.equal(offline.player.position,null)
  manager.config.worldMap.enabled=false;assert.equal((await fetch(url+uuid)).status,404)
})
