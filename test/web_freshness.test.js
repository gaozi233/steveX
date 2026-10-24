const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const read=name=>fs.readFileSync(path.join(__dirname,'../src/web/public/lib',name),'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'')
const flush=()=>new Promise(r=>setImmediate(r))
const label=()=>({dataset:{},textContent:'',setAttribute(){}})
function harness(file,extra={}){
  const calls=[],timers=new Map(),events={};let id=0,now=1000
  class Clock extends Date {constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
  const context=vm.createContext({Date:Clock,AbortController,MutationObserver:class{observe(){}disconnect(){}},
    window:{addEventListener(){},removeEventListener(){}},URL:{createObjectURL:()=> 'blob:old',revokeObjectURL(){}},
    setTimeout:(f,ms)=>{const n=++id;timers.set(n,{f,ms});return n},clearTimeout:n=>timers.delete(n),
    fetch:(url,options)=>new Promise(resolve=>calls.push({url,options,resolve})),...extra})
  vm.runInContext(read('freshness.js')+'\n'+read('runtime-trace.js')+'\n'+read(file),context)
  const container={addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n]}
  return {context,calls,events,container,clock:t=>{now=t},async tick(){const [key,value]=[...timers].find(([,v])=>v.ms===1000);timers.delete(key);value.f();await flush()}}
}
test('freshness labels distinguish validation from world freshness and offline data keeps prior receipt time',()=>{
  const context=vm.createContext({});vm.runInContext(read('freshness.js'),context)
  const el=label();context.setFreshness(el,{checkedAt:1000,mode:'error'})
  assert.match(el.textContent,/Last known.*Update failed/);assert.match(el.title,/not the last world change/)
  assert.match(context.freshnessText({mode:'error'}),/Not checked yet/)
  const old=context.receivedAgents([{name:'A',online:true,health:8}],[],1000)
  const offline=context.receivedAgents([{name:'A',online:false,health:20}],old,9000)
  assert.equal(offline[0].health,8);assert.equal(offline[0].freshness.checkedAt,1000)
  assert.equal(offline[0].freshness.mode,'offline')
})
test('inventory 304 advances check time, failures preserve last-known slots, and recovery clears the warning',async()=>{
  const stamp=label(),content={innerHTML:'',querySelectorAll:()=>[]}
  const h=harness('inventory-preview.js')
  h.context.createInventoryTooltip=()=>({refresh(){},destroy(){}});h.context.inventoryHtml=()=> 'cached slots'
  const panel={open:true,isConnected:true,matches:()=>true,closest:()=>({dataset:{agentName:'A'}}),querySelector:s=>s.includes('freshness')?stamp:content}
  const release=h.context.initInventoryPreview(h.container);h.events.toggle({target:panel})
  const response=()=>({ok:true,headers:{get:()=> '"one"'},json:async()=>({ok:true,agentName:'A',sessionId:'s',online:true})})
  h.calls[0].resolve(response());await flush();const first=stamp.title
  h.clock(2000);await h.tick();h.calls[1].resolve({status:304});await flush()
  assert.notEqual(stamp.title,first);assert.equal(content.innerHTML,'cached slots')
  const checked=stamp.title
  h.clock(3000);await h.tick();h.calls[2].resolve({ok:false,json:async()=>({error:'offline transport'})});await flush()
  assert.equal(stamp.title,checked);assert.match(stamp.textContent,/Last known.*Update failed/)
  assert.equal(content.innerHTML,'cached slots')
  h.clock(4000);await h.tick();h.calls[3].resolve(response());await flush()
  assert.equal(stamp.dataset.freshness,'checked');assert.doesNotMatch(stamp.textContent,/Last known/)
  release()
})
test('screenshot caption follows displayed pixels while a newer image is pending or fails',async()=>{
  const vision={open:true},llm={open:false},image={hidden:true,removeAttribute(){delete this.src}},meta={},stamp=label(),button={}
  const parts={'.inspector-vision':vision,'.inspector-llm':llm,'[data-vision-image]':image,'[data-vision-meta]':meta,
    '[data-vision-freshness]':stamp,'[data-vision-status]':{},'[data-inspect-capture]':button}
  const card={isConnected:true,dataset:{agentName:'A'},querySelector:s=>parts[s]||null}
  const h=harness('agent-inspector.js',{updatePlannerTask(){}})
  const release=h.context.initAgentInspector(h.container)
  h.events.toggle({target:{matches:()=>true,closest:()=>card}})
  const status=(frame)=>({ok:true,headers:{get:()=> '"tag"'},json:async()=>({ok:true,agentName:'A',sessionId:'s',online:true,
    renderer:{enabled:true,connected:true},observation:{frameId:frame,observedAt:frame==='old'?'2026-10-25T00:00:00Z':'2026-10-25T01:00:00Z',width:64,height:64}})})
  h.calls[0].resolve(status('old'));await flush()
  h.calls[1].resolve({ok:true,blob:async()=>({})});await flush()
  assert.equal(image.src,'blob:old');assert.match(meta.textContent,/Captured 2026-10-25T00/)
  await h.tick();h.calls[2].resolve(status('new'));await flush()
  assert.match(meta.textContent,/Captured 2026-10-25T00.*Loading newer/)
  assert.doesNotMatch(meta.textContent,/01:00:00/)
  h.calls[3].resolve({ok:false});await flush()
  assert.equal(image.hidden,false);assert.equal(image.src,'blob:old')
  assert.match(meta.textContent,/Captured 2026-10-25T00.*Snapshot unavailable/)
  release()
})
