const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const source = name => fs.readFileSync(path.join(__dirname, '../src/web/public', name), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const flush = () => new Promise(resolve => setImmediate(resolve))
class Observer { observe() {} disconnect() {} }
function pendingFetch() {
  const calls = []
  return { calls, fetch: (url, options) => new Promise(resolve => calls.push({ url, options, resolve })) }
}

test('detail route decodes names without turning encoded separators into navigation', () => {
  const context = vm.createContext({ document: { getElementById() {}, querySelector() {} } })
  const text = source('app.js'); vm.runInContext(text.slice(0,text.indexOf("\ndocument.querySelectorAll('.nav-item')")),context)
  assert.equal(context.routePath('/agents/a%2Fb').name,'a/b')
  assert.equal(context.routePath('/agents/%E4%B8%AD%E6%96%87').name,'中文')
  assert.equal(context.routePath('/agents/%zz').page,'missing')
  assert.equal(context.routePath('/agents').page,'agents')
  assert.equal(context.routePath('/configs').page,'configs')
})

test('leaving single-agent page aborts its status request, unsubscribes and ignores late response', async () => {
  const requests = pendingFetch(), subscriptions = [], container = {}
  const context = vm.createContext({ ...requests, subscribeAgent: name => subscriptions.push(name), AbortController, AbortSignal, setTimeout, clearTimeout })
  vm.runInContext(source('pages/agent-detail.js'), context)
  const release = context.mountAgentDetail(container, 'a/b')
  assert.equal(requests.calls.length,1); assert.equal(requests.calls[0].url,'/api/status?agent=a%2Fb')
  release(); assert.equal(requests.calls[0].options.signal.aborted,true)
  requests.calls[0].resolve({ ok:true, json:async()=>({agents:[]}) }); await flush()
  assert.deepEqual(subscriptions,['a/b',null]); assert.equal(requests.calls.length,1)
  assert.equal(container.innerHTML,'<p role="status">Loading agent...</p>')
})

test('inspector fetches only open section, cancels close/switch/unmount and has no eager fetch', async () => {
  const requests = pendingFetch(), listeners = {}
  const vision = { open:false }, llm = { open:false }, image = { removeAttribute() {} }
  const card = { isConnected:true, dataset:{agentName:'a'}, querySelector: selector => selector === '.inspector-vision' ? vision : selector === '.inspector-llm' ? llm : image }
  const panel = { matches:()=>true, closest:()=>card }
  const container = { addEventListener:(name,fn)=>{listeners[name]=fn}, removeEventListener:name=>{delete listeners[name]} }
  const context = vm.createContext({ ...requests, AbortController, MutationObserver:Observer, setTimeout, clearTimeout, URL })
  vm.runInContext(source('lib/agent-inspector.js'),context)
  const release = context.initAgentInspector(container)
  assert.equal(requests.calls.length,0)
  vision.open=true; listeners.toggle({target:panel})
  assert.match(requests.calls[0].url,/\/a\/debug\?section=vision$/)
  vision.open=false; llm.open=true; listeners.toggle({target:panel})
  assert.equal(requests.calls[0].options.signal.aborted,true)
  assert.match(requests.calls[1].url,/section=llm$/)
  llm.open=false; listeners.toggle({target:panel})
  assert.equal(requests.calls[1].options.signal.aborted,true)
  vision.open=true; listeners.toggle({target:panel}); release()
  assert.equal(requests.calls[2].options.signal.aborted,true)
  for (const call of requests.calls) call.resolve({status:304})
  await flush(); assert.equal(requests.calls.length,3); assert.deepEqual(Object.keys(listeners),[])
})

test('inventory panel is lazy and disposal aborts fetch and removes tooltip/global listeners', async () => {
  const requests = pendingFetch(), listeners = {}, globalListeners = new Set(); let removed = false
  const content = {}, panel = { isConnected:true, open:true, matches:()=>true, closest:()=>({dataset:{agentName:'b'}}), querySelector:()=>content }
  const tooltip = { setAttribute(){}, remove(){removed=true} }
  const context = vm.createContext({ ...requests, AbortController, MutationObserver:Observer, setTimeout, clearTimeout,
    document:{ createElement:()=>tooltip,body:{appendChild(){}} },
    window:{ addEventListener:name=>globalListeners.add(name),removeEventListener:name=>globalListeners.delete(name) } })
  vm.runInContext(source('lib/inventory-preview.js'),context)
  const container = { addEventListener:(name,fn)=>{listeners[name]=fn},removeEventListener:name=>{delete listeners[name]} }
  const release = context.initInventoryPreview(container)
  assert.equal(requests.calls.length,0)
  listeners.toggle({target:panel}); assert.match(requests.calls[0].url,/\/b\/inventory-preview$/)
  release(); assert.equal(requests.calls[0].options.signal.aborted,true)
  requests.calls[0].resolve({ok:true,json:async()=>({ok:true,agentName:'b',online:false})})
  await flush(); assert.equal(content.textContent,'Loading...'); assert.equal(removed,true)
  assert.equal(globalListeners.size,0); assert.deepEqual(Object.keys(listeners),[])
})

test('detail control requests carry cancellation signals outside JSON payloads', async () => {
  const requests = [], controller = new AbortController()
  const context = vm.createContext({ fetch: async (url, options) => { requests.push({url,options}); return {ok:true,json:async()=>({ok:true})} } })
  vm.runInContext(source('lib/api.js'),context)
  await context.sendCommand('a','hp',{signal:controller.signal})
  await context.sendPlannerMessage('a','goal','once',{operation:'new'},{signal:controller.signal})
  await context.controlPlanner('a','pause','once','task',{signal:controller.signal})
  await context.stopPlanner('a',{signal:controller.signal})
  await context.connectAgent('a',{signal:controller.signal})
  await context.disconnectAgent('a',{signal:controller.signal})
  controller.abort()
  for (const request of requests) { assert.equal(request.options.signal.aborted,true); assert.doesNotMatch(request.options.body || '', /signal/) }
})

test('closing inspector aborts pending RGB fetch and does not create a late object URL', async () => {
  const requests=pendingFetch(), listeners={}
  const image={hidden:true,removeAttribute(){}}, button={}, status={}, meta={}, vision={open:true}, llm={open:false}
  const nodes={'.inspector-vision':vision,'.inspector-llm':llm,'[data-vision-image]':image,'[data-inspect-capture]':button,'[data-vision-status]':status,'[data-vision-meta]':meta}
  const card={isConnected:true,dataset:{agentName:'a'},querySelector:selector=>nodes[selector]}
  const context=vm.createContext({...requests,AbortController,MutationObserver:Observer,setTimeout,clearTimeout,updatePlannerTask(){},URL:{createObjectURL(){throw Error('late image must not render')},revokeObjectURL(){}}})
  vm.runInContext(source('lib/agent-inspector.js'),context)
  const container={addEventListener:(name,fn)=>{listeners[name]=fn},removeEventListener:name=>{delete listeners[name]}}
  const release=context.initAgentInspector(container)
  listeners.toggle({target:{matches:()=>true,closest:()=>card}})
  requests.calls[0].resolve({ok:true,status:200,headers:{get:()=>null},json:async()=>({ok:true,online:true,agentName:'a',sessionId:'s',renderer:{enabled:true,connected:true},observation:{frameId:'f',observedAt:'now',width:10,height:10}})})
  await flush(); assert.match(requests.calls[1].url,/observation\/f\/rgb$/)
  release(); assert.equal(requests.calls[1].options.signal.aborted,true)
  requests.calls[1].resolve({ok:true,blob:async()=>''}); await flush()
  assert.equal(image.hidden,true)
})

test('switching LLM panel does not cancel an ongoing view capture, but closing View does', async () => {
  const requests=pendingFetch(), listeners={}, vision={open:true}, llm={open:false}
  const button={}, image={removeAttribute(){}}, content={querySelectorAll:()=>[],scrollTop:0}
  const nodes={'.inspector-vision':vision,'.inspector-llm':llm,'[data-inspect-capture]':button,'[data-vision-image]':image,'[data-vision-status]':{},'[data-vision-meta]':{},'.llm-trace-content':content}
  const card={isConnected:true,dataset:{agentName:'a'},querySelector:s=>nodes[s]}
  const context=vm.createContext({...requests,AbortController,MutationObserver:Observer,setTimeout,clearTimeout,updatePlannerTask(){},URL})
  vm.runInContext(source('lib/agent-inspector.js'),context)
  const container={addEventListener:(name,fn)=>{listeners[name]=fn},removeEventListener:name=>{delete listeners[name]}}
  const release=context.initAgentInspector(container)
  const toggle=()=>listeners.toggle({target:{matches:()=>true,closest:()=>card}})
  toggle()
  requests.calls[0].resolve({ok:true,status:200,headers:{get:()=>null},json:async()=>({ok:true,online:true,agentName:'a',sessionId:'s',renderer:{enabled:true,connected:true},observation:null,turns:[]})})
  await flush()
  const capture=listeners.click({target:{closest:selector=>selector==='.agent-card'?card:button}})
  assert.match(requests.calls[1].url,/\/observe$/)
  llm.open=true; toggle(); llm.open=false; toggle()
  assert.equal(requests.calls[1].options.signal.aborted,false)
  vision.open=false; toggle()
  assert.equal(requests.calls[1].options.signal.aborted,true)
  for (const request of requests.calls.slice(2)) request.resolve({status:304})
  requests.calls[1].resolve({ok:true,json:async()=>({ok:true})})
  await capture; release(); await flush()
})
