const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const { once } = require('node:events')
const { createApp } = require('../src/web/server/app')
const { worldMapSettings } = require('../src/web/server/world_map')

test('world map is opt-in, human-only and limited to a separate loopback HTTP origin', () => {
  assert.deepEqual(worldMapSettings(),{enabled:false,audience:'human'})
  assert.equal(worldMapSettings({enabled:true,url:'http://127.0.0.1:8100/'}).updates,'asynchronous')
  for(const url of ['https://example.com/','file:///tmp/world','javascript:alert(1)','http://127.0.0.1:8100/private','http://user:pass@127.0.0.1:8100/','http://127.0.0.1:8100/?key=secret','http://localhost/']) {
    assert.throws(()=>worldMapSettings({enabled:true,url}))
  }
})

test('world page and read-only configuration route do not read renderer or agent data', async t => {
  const manager={config:{},agents:new Map(),agentConfigs:new Map(),getStatus:()=>[]}
  const server=createApp(manager).listen(0,'127.0.0.1')
  await once(server,'listening')
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))})
  const origin='http://127.0.0.1:'+server.address().port
  assert.equal((await fetch(origin+'/world')).status,200)
  assert.equal((await (await fetch(origin+'/api/world-map')).json()).enabled,false)
  manager.config.worldMap={enabled:true,url:'http://127.0.0.1:8100/'}
  const data=await (await fetch(origin+'/api/world-map')).json()
  assert.equal(data.audience,'human');assert.equal(data.source,'world-files')
  assert.equal(data.url,'http://127.0.0.1:8100/')
  manager.config.worldMap.url=origin
  assert.equal((await fetch(origin+'/api/world-map')).status,400)
  manager.config.worldMap.url=origin.replace('127.0.0.1','localhost')
  assert.equal((await fetch(origin+'/api/world-map')).status,400)
  assert.equal((await fetch(origin+'/api/world-map',{method:'POST'})).status,404)
})

test('leaving World aborts settings, ignores late results and removes an already loaded iframe', async () => {
  const source=fs.readFileSync(path.join(__dirname,'../src/web/public/pages/world.js'),'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'')
  let resolve,signal,removed=false,listener
  const frame={src:'',remove(){removed=true}},reload={addEventListener(n,fn){listener=fn},removeEventListener(){listener=null}}
  const container={innerHTML:'',querySelector:s=>s==='iframe'?frame:reload}
  const context=vm.createContext({AbortController,URL,setTimeout,clearTimeout,location:{origin:'http://127.0.0.1:8090'},
    escapeHtml:s=>s,hydrateIcons(){},fetch:(url,opts)=>{assert.equal(url,'/api/world-map');signal=opts.signal;return new Promise(r=>{resolve=r})}})
  vm.runInContext(source,context)
  const response={ok:true,json:async()=>({ok:true,enabled:true,url:'http://127.0.0.1:8100/'})}
  const release=context.mountWorld(container);release()
  resolve(response);await new Promise(r=>setImmediate(r))
  assert.equal(signal.aborted,true);assert.equal(frame.src,'')
  const release2=context.mountWorld(container)
  resolve(response);await new Promise(r=>setImmediate(r))
  assert.equal(frame.src,'http://127.0.0.1:8100/');assert.ok(listener)
  release2();assert.equal(frame.src,'about:blank');assert.equal(removed,true);assert.equal(listener,null)
})

test('World unloads in the background, restores a trusted camera and removes listeners',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/web/public/pages/world.js'),'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'')
  const events=new Map(),windowEvents=new Map(),frame={src:'',contentWindow:{},remove(){}},button={addEventListener(){},removeEventListener(){}}
  const document={hidden:false,addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)}
  const window={addEventListener:(n,f)=>windowEvents.set(n,f),removeEventListener:n=>windowEvents.delete(n)}
  const context=vm.createContext({document,window,AbortController,URL,setTimeout,clearTimeout,location:{origin:'http://127.0.0.1:8090'},
    escapeHtml:s=>s,hydrateIcons(){},fetch:async()=>({ok:true,json:async()=>({ok:true,enabled:true,url:'http://127.0.0.1:8100/'})})})
  vm.runInContext(source,context)
  const release=context.mountWorld({innerHTML:'',querySelector:s=>s==='iframe'?frame:button})
  await new Promise(r=>setImmediate(r))
  const message={origin:'http://127.0.0.1:8100',source:frame.contentWindow,data:{type:'stevex-map-camera',hash:'#natural:1:2:3'}}
  windowEvents.get('message')(message)
  windowEvents.get('message')({...message,origin:'http://evil.example',data:{...message.data,hash:'#evil'}})
  windowEvents.get('message')({...message,source:{},data:{type:'stevex-player-select',uuid:'00000000-0000-0000-0000-000000000001',x:1,y:1,width:100,height:100}})
  windowEvents.get('message')({...message,data:{type:'stevex-player-select',uuid:'invalid',x:1,y:1,width:100,height:100}})
  document.hidden=true;events.get('visibilitychange')();assert.equal(frame.src,'about:blank')
  document.hidden=false;events.get('visibilitychange')();assert.equal(frame.src,'http://127.0.0.1:8100/#natural:1:2:3')
  release();assert.equal(events.size,0);assert.equal(windowEvents.size,0)
})
