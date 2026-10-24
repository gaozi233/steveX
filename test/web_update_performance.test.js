const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path')
const {once}=require('node:events'),express=require('express')
const {registerInventoryRoutes}=require('../src/web/server/inventory')
const {AgentManager}=require('../src/agent/agent_manager')
const source=name=>['lib/freshness.js','lib/runtime-trace.js',name].map(file=>fs.readFileSync(path.join(__dirname,'../src/web/public',file),'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'')).join('\n')
const flush=()=>new Promise(r=>setImmediate(r))
function harness(){
  const events=new Map(),timers=new Map(),calls=[];let next=0
  const document={hidden:false,addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)}
  return {events,timers,calls,document,context:{document,AbortController,AbortSignal,
    setTimeout:(f,ms)=>{const id=++next;timers.set(id,{f,ms});return id},clearTimeout:id=>timers.delete(id),
    fetch:(url,options)=>new Promise(resolve=>calls.push({url,options,resolve}))},
    visibility(hidden){document.hidden=hidden;events.get('visibilitychange')()},
    async runTimer(ms){const pair=[...timers].find(([,v])=>v.ms===ms);assert.ok(pair,'scheduled '+ms);timers.delete(pair[0]);pair[1].f();await flush()}}
}
test('detail polling aborts in background, resumes once, and rejects a late old response',async()=>{
  const h=harness(),rendered=[],subscriptions=[]
  const context=vm.createContext({...h.context,subscribeAgent:n=>subscriptions.push(n),renderAgentDetail:(c,a)=>rendered.push(a.name),initAgentDetail:()=>()=>{}})
  vm.runInContext(source('pages/agent-detail.js'),context)
  const release=context.mountAgentDetail({querySelector:()=>null},'A')
  h.visibility(true);assert.equal(h.calls[0].options.signal.aborted,true)
  h.visibility(false);assert.equal(h.calls.length,2)
  h.calls[0].resolve({ok:true,json:async()=>({agents:[{name:'old'}]})});await flush();assert.equal(rendered.length,0)
  h.calls[1].resolve({ok:true,json:async()=>({agents:[{name:'A'}]})});await flush()
  assert.deepEqual(rendered,['A']);assert.equal([...h.timers.values()].filter(t=>t.ms===1000).length,1)
  release();assert.equal(h.events.size,0);assert.equal(h.timers.size,0)
})
test('inventory conditional requests keep DOM on 304 and resume after visibility changes',async()=>{
  const h=harness(),listeners={},content={innerHTML:'',querySelectorAll:()=>[]};let renders=0
  const panel={isConnected:true,open:true,matches:()=>true,closest:()=>({dataset:{agentName:'A'}}),querySelector:()=>content}
  const context=vm.createContext({...h.context,MutationObserver:class{observe(){}disconnect(){}},
    window:{addEventListener(){},removeEventListener(){}},escapeHtml:s=>s})
  const text=source('lib/inventory-preview.js')
  // Exercise the real updater with the unrelated DOM tooltip/HTML rendering stubbed.
  vm.runInContext(text,context)
  context.createInventoryTooltip=()=>({refresh(){},destroy(){}})
  context.inventoryHtml=()=>{renders++;return 'inventory'}
  const release=context.initInventoryPreview({addEventListener:(n,f)=>listeners[n]=f,removeEventListener:n=>delete listeners[n]})
  listeners.toggle({target:panel})
  h.calls[0].resolve({ok:true,status:200,headers:{get:()=> '"one"'},json:async()=>({ok:true,agentName:'A'})});await flush()
  assert.equal(renders,1)
  await h.runTimer(1000);assert.equal(h.calls[1].options.headers['If-None-Match'],'"one"')
  h.calls[1].resolve({status:304,json(){throw Error('304 body must not be read')}});await flush();assert.equal(renders,1)
  h.visibility(true);assert.equal([...h.timers.values()].filter(t=>t.ms===1000).length,0)
  h.visibility(false);assert.equal(h.calls.length,3)
  release();assert.equal(h.calls[2].options.signal.aborted,true);assert.equal(h.events.size,0)
})
test('WebSocket reconnects without navigation, restores latest selection and backs off',async()=>{
  const h=harness(),sockets=[],states=[]
  class Socket {
    static OPEN=1;static CLOSED=3
    constructor(){this.readyState=0;this.sent=[];sockets.push(this)}
    send(v){this.sent.push(JSON.parse(v))}
    close(){this.readyState=3;this.onclose?.()}
    open(){this.readyState=1;this.onopen()}
  }
  const context=vm.createContext({...h.context,WebSocket:Socket,location:{protocol:'http:',host:'localhost'},
    setState:s=>states.push(s),patchAgent(){},addLog(){}})
  vm.runInContext(source('lib/ws-client.js'),context)
  const release=context.initWebSocket();context.subscribeAgent('A');sockets[0].open()
  assert.equal(sockets[0].sent.at(-1).agent,'A')
  sockets[0].close();context.subscribeAgent('B');await h.runTimer(1000)
  sockets[1].close();await h.runTimer(2000);sockets[2].open()
  assert.equal(sockets[2].sent.at(-1).agent,'B')
  h.visibility(true);assert.equal(sockets[2].sent.at(-1).paused,true)
  h.visibility(false);assert.equal(sockets[2].sent.at(-1).agent,'B')
  sockets[2].onmessage({data:'invalid json'})
  sockets[2].close();h.visibility(true);assert.equal(h.timers.size,0)
  h.visibility(false);assert.equal(sockets.length,4)
  release();assert.equal(h.events.size,0);assert.equal(h.timers.size,0)
})
test('inspector pauses open panels and ignores late responses across visibility generations',async()=>{
  const h=harness(),listeners={},vision={open:false},llm={open:false},image={removeAttribute(){}}
  const card={isConnected:true,dataset:{agentName:'A'},querySelector:s=>s==='.inspector-vision'?vision:s==='.inspector-llm'?llm:image}
  const panel={matches:()=>true,closest:()=>card}
  const context=vm.createContext({...h.context,URL,MutationObserver:class{observe(){}disconnect(){}},
    window:{addEventListener(){},removeEventListener(){}}})
  vm.runInContext(source('lib/agent-inspector.js'),context)
  const release=context.initAgentInspector({addEventListener:(n,f)=>listeners[n]=f,removeEventListener:n=>delete listeners[n]})
  llm.open=true;listeners.toggle({target:panel});assert.equal(h.calls.length,1)
  h.visibility(true);assert.equal(h.calls[0].options.signal.aborted,true)
  h.visibility(false);assert.equal(h.calls.length,2)
  h.calls[0].resolve({status:304});await flush()
  assert.equal([...h.timers.values()].filter(t=>t.ms===1000).length,0)
  h.calls[1].resolve({status:304});await flush()
  assert.equal([...h.timers.values()].filter(t=>t.ms===1000).length,1)
  release();assert.equal(h.timers.size,0);assert.equal(h.events.size,0)
})
test('inventory ETag changes with contents/session and unchanged requests have no body',async t=>{
  const agent={name:'A',sessionId:'one',isOnline:()=>false},manager={agents:new Map([['A',agent]])}
  const app=express();registerInventoryRoutes(app,manager)
  const server=app.listen(0,'127.0.0.1');await once(server,'listening')
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))})
  const url=`http://127.0.0.1:${server.address().port}/api/agents/A/inventory-preview`
  const first=await fetch(url),etag=first.headers.get('etag');assert.ok(etag)
  const unchanged=await fetch(url,{headers:{'If-None-Match':etag}})
  assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'')
  agent.sessionId='two'
  const changed=await fetch(url,{headers:{'If-None-Match':etag}})
  assert.equal(changed.status,200);assert.notEqual(changed.headers.get('etag'),etag)
})
test('summary status avoids full task/executor/model computation and filters agents early',()=>{
  const manager=Object.create(AgentManager.prototype)
  manager.agentConfigs=new Map([['A',{name:'A'}],['B',{name:'B'}]])
  const agent={getUsername:()=>'Player A',isOnline:()=>true,brainLoop:{running:false,task:{id:'t',status:'paused'},getTaskStatus(){throw Error('full task built')}},executor:{getStatus(){throw Error('executor built')}}}
  manager.agents=new Map([['A',agent],['B',{isOnline(){throw Error('unselected agent read')}}]])
  const [summary]=manager.getStatus({summary:true,name:'A'})
  assert.equal(summary.brain.task.id,'t');assert.equal(summary.model,undefined);assert.equal(summary.execution,undefined)
})
