const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter,once}=require('node:events')
const {publicConfig,restoreCredentials,KEEP_CREDENTIAL}=require('../src/utils/config_write')
test('config credentials are masked and preserved by agent identity, not array index',()=>{
 const old={llm:{apiKey:'test-root-secret'},agents:[{name:'A',llm:{apiKey:'test-secret-A',apiKeyEnv:'KEY_A'}},{name:'B',llm:{apiKey:'test-secret-B'}}]}
 const visible=publicConfig(old);assert.ok(!JSON.stringify(visible).includes('test-secret'));assert.equal(visible.llm.apiKey,KEEP_CREDENTIAL)
 visible.agents.reverse();const saved=restoreCredentials(visible,old)
 assert.equal(saved.agents[0].llm.apiKey,'test-secret-B');assert.equal(saved.agents[1].llm.apiKey,'test-secret-A')
 assert.equal(saved.agents[1].llm.apiKeyEnv,'KEY_A')
 assert.equal(restoreCredentials({llm:{}},old).llm.apiKey,'test-root-secret')
 assert.equal(restoreCredentials({llm:{apiKey:''}},old).llm.apiKey,'')
 assert.equal(restoreCredentials({llm:{apiKey:null}},old).llm.apiKey,null)
 assert.throws(()=>restoreCredentials({agents:[{name:'C',llm:{apiKey:KEEP_CREDENTIAL}}]},old),/does not exist/)
 assert.deepEqual(restoreCredentials({agents:[]},old).agents,[])
})
test('WebSocket send bounds queued bytes, drops stale snapshots and closes failed sends',()=>{
 const {sendPayload}=require('../src/web/server/ws');let sends=0,closed=0
 const client={readyState:1,bufferedAmount:300000,send(p,cb){sends++;cb()},terminate(){closed++}}
 assert.equal(sendPayload(client,'snapshot',true),false);assert.equal(sends,0)
 assert.equal(sendPayload(client,'event'),true);assert.equal(sends,1)
 client.bufferedAmount=1024*1024;sendPayload(client,'event');assert.equal(closed,1)
 client.bufferedAmount=0;client.send=(p,cb)=>cb(Error('closed'));sendPayload(client,'event');assert.equal(closed,2)
 client.send=()=>{throw Error('closed')};sendPayload(client,'event');assert.equal(closed,3)
 client.readyState=3;assert.equal(sendPayload(client,'event'),true)
})
test('cancelled native opening blocks its successor until the underlying operation settles',async()=>{
 const {ActionExecutor}=require('../src/agent/action_executor'),{openWindow}=require('../src/commands/window_open')
 const bot=Object.assign(new EventEmitter(),{_client:new EventEmitter()});let resolve,successor=false
 bot.openBlock=()=>new Promise(r=>resolve=r);bot.closeWindow=()=>{bot.currentWindow=null}
 const executor=new ActionExecutor(),abort=new AbortController()
 const first=executor.run('open',signal=>openWindow(bot,{name:'chest'},{signal}),{signal:abort.signal})
 const rejected=assert.rejects(first)
 await new Promise(r=>setImmediate(r));abort.abort()
 const second=executor.run('next',async()=>{successor=true;assert.equal(bot.currentWindow,null)})
 await new Promise(r=>setImmediate(r));assert.equal(successor,false)
 const window={type:'fixture'};bot.currentWindow=window;resolve(window)
 await rejected;await second;assert.equal(successor,true);bot.emit('end')
})
test('upgraded Mineflayer produces one compatibility-review warning without applying a guessed patch',()=>{
 const {checkRaycastVersion}=require('../src/agent/raycast_compat'),warnings=[]
 assert.equal(checkRaycastVersion('4.39.0',m=>warnings.push(m)),true)
 for(let i=0;i<2;i++)assert.equal(checkRaycastVersion('test-new-version',m=>warnings.push(m)),false)
 assert.equal(warnings.length,1);assert.match(warnings[0],/revalidate/)
})
test('HTTP config roundtrip masks secrets and agent routes decode names only once',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),express=require('express')
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stevex-maintenance-http-')),file=path.join(dir,'config.json')
 const old={llm:{apiKey:'fixture-private-key'}};await fs.writeFile(file,JSON.stringify(old))
 const previous=process.env.STEVEX_CONFIG;process.env.STEVEX_CONFIG=file
 const modulePath=require.resolve('../src/web/server/routes');delete require.cache[modulePath]
 const {registerRoutes}=require(modulePath)
 if(previous===undefined)delete process.env.STEVEX_CONFIG;else process.env.STEVEX_CONFIG=previous
 const calls=[],manager={agents:new Map(),agentConfigs:new Map(),config:{},eventBus:new EventEmitter(),
 connectAgent:name=>{calls.push(name);return true},disconnectAgent:name=>{calls.push(name);return true},sendCommand:async name=>{calls.push(name);return {ok:true}}}
 const app=express();app.use(express.json());registerRoutes(app,manager);const server=app.listen(0,'127.0.0.1');await once(server,'listening')
 t.after(async()=>{require('../src/web/server/agent_debug').getDebugStore(manager).close();server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true})})
 const origin='http://127.0.0.1:'+server.address().port
 const data=await(await fetch(origin+'/api/config/environment')).json();assert.equal(data.config.llm.apiKey,KEEP_CREDENTIAL)
 let response=await fetch(origin+'/api/config/environment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({config:data.config})})
 assert.equal(response.status,200);assert.equal(JSON.parse(await fs.readFile(file)).llm.apiKey,'fixture-private-key')
 for(const operation of ['connect','disconnect','command']){
   response=await fetch(origin+'/api/agents/'+encodeURIComponent('literal%2F%name')+'/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:'pos'})})
   assert.equal(response.status,200)
 }
 assert.deepEqual(calls,['literal%2F%name','literal%2F%name','literal%2F%name'])
})
