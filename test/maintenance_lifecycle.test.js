const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter,once}=require('node:events')
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm')
const flush=()=>new Promise(r=>setImmediate(r)),sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function until(check){for(let i=0;i<250;i++){if(await check())return;await sleep(20)}throw Error('Condition timed out')}

test('overview updates passive state without command events, but does not rebroadcast unchanged state',async t=>{
 const http=require('node:http'),WebSocket=require('ws'),{setupWebSocket}=require('../src/web/server/ws')
 let online=true,health=20,x=1
 const manager={config:{},agents:new Map(),agentConfigs:new Map(),eventBus:new EventEmitter(),getStatus:()=>[{name:'A',online,health,position:{x,y:70,z:0}}]}
 const server=http.createServer(),wss=setupWebSocket(server,manager);server.listen(0,'127.0.0.1');await once(server,'listening')
 const socket=new WebSocket('ws://127.0.0.1:'+server.address().port),messages=[];socket.on('message',b=>messages.push(JSON.parse(b)))
 t.after(async()=>{socket.terminate();for(const client of wss.clients)client.terminate();await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r))})
 await until(()=>messages.some(m=>m.type==='snapshot'))
 health=15;x=2;online=false
 await until(()=>messages.some(m=>m.type==='snapshot'&&m.agents[0].health===15&&m.agents[0].online===false))
 await sleep(1100);const count=messages.length;await sleep(1100);assert.equal(messages.length,count)
})

test('map publisher reconfigures disabled/enabled, paths, dimensions and clears old feeds before close',async t=>{
 const {startWorldMapPlayers}=require('../src/web/server/world_map_players')
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stevex-publisher-reload-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}))
 const bot={game:{dimension:'overworld'},entity:{uuid:'00000000-0000-0000-0000-000000000001',position:{x:1,y:70,z:2},yaw:0,pitch:0}}
 const manager={config:{worldMap:{enabled:false}},agents:new Map([['A',{bot,isOnline:()=>true,getUsername:()=>'A'}]])},warnings=[]
 const publisher=startWorldMapPlayers(manager,m=>warnings.push(m));t.after(()=>publisher.close())
 const first=path.join(dir,'one','players.json'),second=path.join(dir,'two','players.json')
 manager.config={worldMap:{enabled:true,playersFile:first,dimension:'minecraft:overworld'}}
 await until(async()=>!!await fs.stat(first).catch(()=>null))
 assert.equal(JSON.parse(await fs.readFile(first)).players.length,1)
 manager.config={worldMap:{enabled:true,playersFile:second,dimension:'minecraft:the_nether'}}
 await until(async()=>!!await fs.stat(second).catch(()=>null))
 assert.equal(JSON.parse(await fs.readFile(second)).players.length,0,'New dimension must not publish overworld players')
 assert.deepEqual(JSON.parse(await fs.readFile(first)),{players:[]})
 const close=publisher.close();assert.equal(publisher.close(),close);await close
 assert.deepEqual(JSON.parse(await fs.readFile(second)),{players:[]});assert.deepEqual(warnings,[])
})

test('renderer connection changes invalidate debug ETag even without an agent event',async t=>{
 const {createApp}=require('../src/web/server/app'),{getDebugStore}=require('../src/web/server/agent_debug');let connected=false
 const manager={config:{},agents:new Map([['A',{sessionId:'session',isOnline:()=>true}]]),agentConfigs:new Map(),eventBus:new EventEmitter(),renderService:{renderer:{isConnected:()=>connected}}}
 const server=createApp(manager).listen(0,'127.0.0.1');await once(server,'listening')
 t.after(async()=>{getDebugStore(manager).close();server.closeAllConnections();await new Promise(r=>server.close(r))})
 const url='http://127.0.0.1:'+server.address().port+'/api/agents/A/debug?section=vision'
 const first=await fetch(url),tag=first.headers.get('etag');connected=true
 const second=await fetch(url,{headers:{'If-None-Match':tag}});assert.equal(second.status,200);assert.equal((await second.json()).renderer.connected,true)
 assert.equal((await fetch(url,{headers:{'If-None-Match':second.headers.get('etag')}})).status,304)
})

test('renderer close drains work but bounds an unresponsive final unbind and always closes transport',async()=>{
 const {SharedRenderService}=require('../src/render_bridge/service');let closed=0,resolveWork,called=false
 const renderer={isConnected:()=>true,call:()=>{called=true;return new Promise(()=>{})},close:()=>closed++}
 const service=new SharedRenderService({memoryNamespace:'fixture'},[],renderer)
 const work=service.queue.run(()=>new Promise(r=>resolveWork=r));await flush()
 const close=service.close();await flush();assert.equal(called,false);assert.equal(closed,0)
 resolveWork();await work;await close;assert.equal(closed,1);assert.equal(called,true)
 await service.close();assert.equal(closed,1)
})

test('old Config save cannot overwrite a newly mounted page or a newer request',async()=>{
 const source=(await fs.readFile(path.join(__dirname,'../src/web/public/pages/configs.js'),'utf8')).replace(/^import .*$/gm,'').replace(/^export /gm,'')
 const saves=[],context=vm.createContext({console,navigator:{},fetchEnvConfig:async()=>({config:{}}),saveEnvConfig:()=>new Promise(r=>saves.push(r)),reloadConfig:async()=>{}})
 vm.runInContext(source,context)
 const create=()=>{const editor={isConnected:true,value:'{}'},status={textContent:''},button={addEventListener(){}};return {editor,status,innerHTML:'',querySelector:s=>s==='#config-editor'?editor:s==='#config-status'?status:button}}
 const first=create();context.renderConfigs(first);await flush();first.editor.value='{}';const save=context.saveConfig()
 first.editor.isConnected=false;const second=create();context.renderConfigs(second);await flush();const text=second.status.textContent
 saves.shift()();await save;assert.equal(second.status.textContent,text)
 const old=context.saveConfig(),latest=context.saveConfig();saves[1]();await latest;second.status.textContent='newer page state';saves[0]();await old
 assert.equal(second.status.textContent,'newer page state')
})
