// Isolated transport/UI acceptance: no Minecraft, Fabric, credentials or model calls.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {AgentManager}=require('../src/agent/agent_manager'),{createApp}=require('../src/web/server/app'),{setupWebSocket}=require('../src/web/server/ws')
const directory=path.resolve(__dirname,'../runs/web-update-performance')
async function startPreview(port=8093){
  const manager=Object.create(AgentManager.prototype)
  manager.config={renderer:{enabled:false}};manager.eventBus=new EventEmitter();manager.agents=new Map();manager.agentConfigs=new Map()
  for(const name of ['Preview-A','Preview-B','Preview-C']){
    const slots=Array(46).fill(null);slots[9]={name:'stone',displayName:'Stone',count:2,slot:9,type:1}
    const cfg={name,llm:{model:'Preview only - no model calls'}}
    const bot={health:20,maxHealth:20,version:'1.21.11',game:{gameMode:'survival'},entity:{position:{x:1,y:64,z:3}},
      inventory:{slots},quickBarSlot:0,getEquipmentDestSlot:d=>({head:5,torso:6,legs:7,feet:8,'off-hand':45}[d])}
    manager.agentConfigs.set(name,cfg);manager.agents.set(name,{name,sessionId:name+'-preview',config:cfg,bot,isOnline:()=>true,getUsername:()=>name,
      currentAction:'Idle',executor:{getStatus:()=>null}})
  }
  const requests=[],app=createApp(manager),server=http.createServer((req,res)=>{
    requests.push({url:req.url,at:Date.now()});if(requests.length>2000)requests.shift()
    app(req,res)
  })
  const wss=setupWebSocket(server,manager)
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
  return {manager,requests,server,wss,origin:'http://127.0.0.1:'+server.address().port,
    async close(){for(const c of wss.clients)c.terminate();await new Promise(r=>wss.close(r));server.closeAllConnections();await new Promise(r=>server.close(r))}}
}
async function main(){
  const {chromium}=require('../runs/web-inventory-tools/node_modules/playwright')
  await fs.mkdir(directory,{recursive:true})
  const preview=await startPreview(process.argv.includes('--serve')?8093:0),report={paidModelCalls:0,minecraftClients:0,origin:preview.origin}
  let browser
  try{
    browser=await chromium.launch({channel:'msedge',headless:true})
    const page=await browser.newPage(),errors=[],responses=[],sockets=[]
    let navigations=0
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++})
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(/\/api\/agents\/[^/]+\/inventory-preview$/.test(r.url()))responses.push({status:r.status(),length:r.headers()['content-length']})})
    page.on('websocket',socket=>sockets.push(socket))
    await page.goto(preview.origin+'/agents/Preview-A')
    await page.getByPlaceholder('Enter command...').fill('unsent draft')
    await page.locator('.inventory-preview summary').click()
    await page.locator('.inspector-vision summary').click()
    await page.locator('.inspector-llm summary').click()
    await page.waitForTimeout(2600)
    assert.ok(responses.some(r=>r.status===304));report.inventoryResponses=responses.slice()
    const apiCount=()=>preview.requests.filter(r=>r.url.startsWith('/api/')).length
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))})
    await page.waitForTimeout(200)
    const count=apiCount();await page.waitForTimeout(2200)
    report.hiddenRequests=apiCount()-count;assert.equal(report.hiddenRequests,0)
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))})
    await page.waitForTimeout(1400)
    report.resumedRequests=apiCount()-count;assert.ok(report.resumedRequests>=3)
    const inventory=page.locator('.inventory-preview-content');await inventory.waitFor()
    const before=await inventory.innerHTML()
    // A data change must invalidate the prior ETag rather than remain stuck at 304.
    preview.manager.agents.get('Preview-A').bot.inventory.slots[9].count=7
    await page.locator('.inventory-preview-content [aria-label^="Stone x7"]').waitFor()
    assert.notEqual(await inventory.innerHTML(),before);report.changedInventoryUpdated=true
    const navBefore=navigations
    report.socketCountBefore=sockets.length
    const reconnected=page.waitForEvent('websocket',{timeout:15000})
    for(const socket of preview.wss.clients)socket.terminate()
    await reconnected
    await page.waitForFunction(async()=>{const state=await import('/lib/state.js');return state.getState().wsConnected})
    assert.ok(sockets.length>report.socketCountBefore)
    assert.equal(await page.getByPlaceholder('Enter command...').inputValue(),'unsent draft')
    assert.equal(await page.locator('.inventory-preview').evaluate(e=>e.open),true)
    const subscribed=[...preview.wss.clients].some(c=>c.agentSubscription==='Preview-A')
    assert.ok(subscribed);report.reconnectedWithoutReload=true
    assert.equal(navigations,navBefore);report.extraNavigationsAfterReconnect=navigations-navBefore
    await page.screenshot({path:path.join(directory,'updated-detail.png')})
    assert.deepEqual(errors,[]);report.errors=errors;report.passed=true
  }finally{
    await browser?.close();await fs.writeFile(path.join(directory,'results.json'),JSON.stringify(report,null,2))
    if(!process.argv.includes('--serve') || !report.passed)await preview.close()
    else {console.log('Preview: '+preview.origin+'/agents/Preview-A (synthetic data; no Minecraft/model calls)');process.on('SIGINT',()=>preview.close());process.on('SIGTERM',()=>preview.close())}
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={startPreview}
