const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter,once}=require('node:events')
const express=require('express'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const {SteveXAgent}=require('../src/agent/agent'),{Brain}=require('../src/agent/brain')
const {getDebugStore,registerDebugRoutes}=require('../src/web/server/agent_debug')
function fixture(t,commands={hp:async()=>({ok:true,health:20})}){
  const eventBus=new EventEmitter(),agent=new SteveXAgent({llm:{apiKey:'fixture-trace-secret'}},'A',commands,{eventBus,queryNames:new Set(['hp'])})
  agent.connected=true;agent.bot=Object.assign(new EventEmitter(),{version:'1.21.11',clearControlStates(){},end(){},pathfinder:{setGoal(){}}})
  const manager={agents:new Map([['A',agent]]),agentConfigs:new Map([['A',agent.config]]),eventBus,config:{}}
  const store=getDebugStore(manager)
  t.after(()=>{agent.shutdown();store.close()})
  return {agent,manager,eventBus,store}
}
test('real command entry records manual calls and exact ID links from an LLM request without changing results',async t=>{
  const expected={ok:true,health:20},f=fixture(t,{hp:async()=>expected})
  const brain=new Brain(f.agent,{apiKey:'fixture-trace-secret'},f.eventBus,{allowedCommands:['hp']})
  f.agent.brainLoop=brain;brain.running=true;brain.llm.chat=async()=> 'hp'
  await brain.tick()
  const view=f.store.snapshot('A'),[turn]=view.turns,[call]=view.calls,[context]=view.contexts
  assert.equal(call.llmRequestId,turn.requestId);assert.equal(call.contextId,context.contextId)
  assert.equal(context.contextId,turn.contextId);assert.equal(context.messages[0].role,'system')
  assert.equal(context.structuredGoal,null);assert.deepEqual(turn.callIds,[call.callId])
  assert.equal(call.status,'returned');assert.deepEqual(JSON.parse(call.result),expected)
  assert.equal(await f.agent.executeCommand('hp'),expected)
  const manual=f.store.snapshot('A','api').calls.at(-1)
  assert.equal(manual.source,'manual');assert.equal(manual.llmRequestId,null);assert.equal(manual.contextId,null)
  assert.notEqual(manual.callId,call.callId)
  f.agent.connected=false
  const rejected=await f.agent.executeCommand('hp')
  assert.equal(rejected.ok,false)
  const offline=f.store.snapshot('A','api').calls.at(-1)
  assert.equal(offline.status,'failed');assert.equal(offline.startedAt,undefined)
  assert.equal(offline.timings.executionMs,0)
})
test('generic contexts and behavior-node API calls work without Brain or an LLM',async t=>{
  const f=fixture(t)
  f.eventBus.emit('agent:context:snapshot',{name:'A',sessionId:f.agent.sessionId,contextId:'node-context',source:'behavior-node',
    structuredGoal:{goal:'observe'},workingMemory:{next:'check'},evidenceRefs:['obs-1']})
  await f.agent.executeCommand('hp',{source:'behavior-node',contextId:'node-context',nodeId:'node-1'})
  const view=f.store.snapshot('A','context,api')
  assert.equal(view.turns,undefined);assert.equal(view.task,undefined)
  assert.equal(view.calls[0].nodeId,'node-1');assert.equal(view.contexts[0].callIds[0],view.calls[0].callId)
  assert.deepEqual(JSON.parse(view.contexts[0].structuredGoal),{goal:'observe'})
  assert.equal(view.contexts[0].requestIds.length,0)
})
test('queued cancellation has a distinct call ID and is not reported as executed',async t=>{
  let finish,entered
  const started=new Promise(r=>entered=r),f=fixture(t,{wait:async()=>{entered();await new Promise(r=>finish=r);return {ok:true}}})
  const first=f.agent.executeCommand('wait 1');await started
  const controller=new AbortController(),second=f.agent.executeCommand('wait 1',{signal:controller.signal})
  let calls=f.store.snapshot('A','api').calls
  assert.equal(calls[0].status,'running');assert.equal(calls[1].status,'submitted')
  controller.abort();finish();await first;const result=await second
  assert.equal(result.cancelled,true)
  calls=f.store.snapshot('A','api').calls
  assert.equal(calls[1].status,'cancelled');assert.equal(calls[1].startedAt,undefined)
  assert.notEqual(calls[0].callId,calls[1].callId)
})
test('API diagnostics redact before retention, enforce count/byte budgets and reject previous sessions',async t=>{
  const f=fixture(t,{hp:async()=>({ok:true,output:'fixture-trace-secret',big:1n})})
  await f.agent.executeCommand('hp')
  assert.doesNotMatch(JSON.stringify(f.store.snapshot('A','api')),/fixture-trace-secret/)
  assert.equal(JSON.parse(f.store.snapshot('A','api').calls[0].result).big,'1')
  for(let i=0;i<110;i++)f.eventBus.emit('agent:api:start',{name:'A',sessionId:f.agent.sessionId,callId:'call-'+i,apiName:'hp',arguments:{}})
  assert.equal(f.store.snapshot('A','api').calls.length,100)
  for(let i=0;i<12;i++)f.eventBus.emit('agent:api:start',{name:'A',sessionId:f.agent.sessionId,callId:'large-'+i,apiName:'hp',arguments:{large:'x'.repeat(150000)}})
  const view=f.store.snapshot('A','api');assert.ok(view.calls.length<100);assert.ok(view.droppedCalls>10)
  assert.ok(Buffer.byteLength(JSON.stringify(view.calls))<1024*1024)
  f.agent.sessionId='replacement'
  f.eventBus.emit('agent:api:done',{name:'A',sessionId:'old',callId:'large-11',result:{ok:true}})
  assert.equal(f.store.snapshot('A','api').calls.length,0)
})
test('section endpoints expose only selected records, support ETag and isolate agents',async t=>{
  const f=fixture(t)
  f.eventBus.emit('agent:llm:input',{name:'A',sessionId:f.agent.sessionId,requestId:'request-1',contextId:'context-1',messages:[{role:'user',content:'private model context'}]})
  await f.agent.executeCommand('hp',{llmRequestId:'request-1',contextId:'context-1'})
  const app=express();registerDebugRoutes(app,f.manager)
  const server=app.listen(0,'127.0.0.1');await once(server,'listening')
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))})
  const url=`http://127.0.0.1:${server.address().port}/api/agents/A/debug`
  const response=await fetch(url+'?section=api'),api=await response.json()
  assert.equal(api.calls.length,1);assert.doesNotMatch(JSON.stringify(api),/private model context/)
  assert.equal((await fetch(url+'?section=api',{headers:{'If-None-Match':response.headers.get('etag')}})).status,304)
  const combined=await(await fetch(url+'?section=context,api')).json()
  assert.match(JSON.stringify(combined.contexts),/private model context/);assert.equal(combined.turns,undefined)
  assert.equal((await fetch(url.replace('/A/','/B/')+'?section=api')).status,404)
  assert.equal((await fetch(url+'?section=api,unknown')).status,400)
})
test('trace HTML escapes arguments/results and keeps missing structured context explicit',()=>{
  const context=vm.createContext({escapeHtml:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')})
  const source=fs.readFileSync(path.join(__dirname,'../src/web/public/lib/runtime-trace.js'),'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'')
  vm.runInContext(source,context)
  const html=context.apiTraceHtml([{callId:'call',apiName:'hp',arguments:'{"x":"<script>"}',result:'{"ok":true}',status:'returned',submittedAt:1}])
  assert.match(html,/&lt;script&gt;/);assert.match(html,/Not recorded/);assert.doesNotMatch(html,/<script>/)
  const snapshot=context.contextTraceHtml([{contextId:'ctx',source:'llm-input',messages:[],recordedAt:1}])
  assert.match(snapshot,/Working Memory/);assert.match(snapshot,/Not recorded/)
})
