// Production tracing entry + synthetic handlers/model. No Minecraft or paid requests.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {SteveXAgent}=require('../src/agent/agent'),{AgentManager}=require('../src/agent/agent_manager'),{Brain}=require('../src/agent/brain')
const {createApp}=require('../src/web/server/app'),{setupWebSocket}=require('../src/web/server/ws'),{getDebugStore}=require('../src/web/server/agent_debug')
const directory=path.resolve(__dirname,'../runs/runtime-trace')
async function startPreview(port=8094){
  const manager=Object.create(AgentManager.prototype)
  manager.config={renderer:{enabled:false}};manager.eventBus=new EventEmitter();manager.agents=new Map();manager.agentConfigs=new Map()
  for(const name of ['Trace-A','Trace-B']){
    const config={name,llm:{model:'Mock provider - no network calls'}}
    const agent=new SteveXAgent(config,name,{hp:async bot=>({ok:true,health:bot.health,maxHealth:bot.maxHealth,source:'synthetic-client-cache'})},
      {eventBus:manager.eventBus,queryNames:new Set(['hp'])})
    agent.connected=true
    const slots=Array(46).fill(null)
    agent.bot=Object.assign(new EventEmitter(),{health:20,maxHealth:20,version:'1.21.11',game:{gameMode:'survival'},entity:{position:{x:1,y:64,z:3}},
      inventory:{slots},username:name,clearControlStates(){},end(){},pathfinder:{setGoal(){}},getEquipmentDestSlot:()=>null})
    manager.agents.set(name,agent);manager.agentConfigs.set(name,config)
  }
  const app=createApp(manager),server=http.createServer(app),wss=setupWebSocket(server,manager),store=getDebugStore(manager)
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
  const a=manager.agents.get('Trace-A'),b=manager.agents.get('Trace-B')
  const brain=new Brain(a,{apiKey:'local-trace-fixture',model:'Mock provider - no network calls'},manager.eventBus,{allowedCommands:['hp']})
  a.brainLoop=brain;brain.running=true;brain.llm.chat=async()=> 'hp'
  await brain.tick();brain.stop();await a.executeCommand('hp')
  manager.eventBus.emit('agent:context:snapshot',{name:'Trace-B',sessionId:b.sessionId,contextId:'behavior-context-b',source:'behavior-node',
    structuredGoal:{goal:'Read current health'},workingMemory:{node:'check-health'},evidenceRefs:[]})
  await b.executeCommand('hp',{source:'behavior-node',contextId:'behavior-context-b',nodeId:'check-health'})
  return {manager,store,wss,server,origin:'http://127.0.0.1:'+server.address().port,
    async close(){for(const agent of manager.agents.values())agent.shutdown();for(const client of wss.clients)client.terminate();await new Promise(r=>wss.close(r));server.closeAllConnections();await new Promise(r=>server.close(r))}}
}
async function main(){
  const {chromium}=require('../runs/web-inventory-tools/node_modules/playwright')
  await fs.mkdir(directory,{recursive:true})
  const preview=await startPreview(process.argv.includes('--serve')?8094:0),report={paidModelCalls:0,minecraftClients:0,origin:preview.origin}
  let browser
  try{
    browser=await chromium.launch({channel:'msedge',headless:true})
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],debug=[]
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/debug?'))debug.push(r.url())})
    const view=preview.store.snapshot('Trace-A'),call=view.calls.find(call=>call.llmRequestId),manual=view.calls.find(call=>!call.llmRequestId)
    await page.goto(preview.origin+'/agents/Trace-A');await page.getByPlaceholder('Enter command...').waitFor()
    assert.equal(debug.length,0)
    await page.locator('.inspector-api summary').click()
    const api=page.locator(`[data-call-id="${call.callId}"]`)
    await api.locator('summary').click()
    assert.ok((await api.innerText()).includes('"health": 20'))
    assert.ok(debug.every(url=>url.endsWith('section=api')))
    assert.equal(await page.locator('.llm-turn').count(),0)
    await api.locator('[data-trace-jump="llm"]').click()
    const request=page.locator(`[data-request-id="${call.llmRequestId}"]`)
    await page.waitForFunction(id=>[...document.querySelectorAll('.llm-turn')].some(e=>e.dataset.requestId===id&&e.open),call.llmRequestId)
    await request.locator('[data-trace-jump="context"]').click()
    const context=page.locator(`[data-context-id="${call.contextId}"]`)
    await page.waitForFunction(id=>[...document.querySelectorAll('.context-record')].some(e=>e.dataset.contextId===id&&e.open),call.contextId)
    const contextText=await context.innerText();assert.ok(contextText.includes('Not recorded'));assert.ok(contextText.includes('Submitted Messages'))
    await context.locator('.context-message summary').first().click()
    assert.ok((await context.innerText()).includes('You are SteveX'))
    const manualRecord=page.locator(`[data-call-id="${manual.callId}"]`)
    await manualRecord.locator('summary').click()
    assert.equal(await manualRecord.locator('[data-trace-jump="llm"]').count(),0)
    await preview.manager.agents.get('Trace-A').executeCommand('hp')
    await page.waitForFunction(()=>document.querySelectorAll('.api-call').length===3)
    assert.equal(await manualRecord.evaluate(e=>e.open),true)
    report.apiContextLlmLinks=true;report.manualNotAutoLinked=true;report.expansionPreserved=true
    await page.screenshot({path:path.join(directory,'linked-records-desktop.png')})
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await context.screenshot({path:path.join(directory,'context-mobile.png')})
    await page.goto(preview.origin+'/agents/Trace-B');await page.locator('.inspector-api summary').click()
    await page.locator('.api-call').waitFor()
    assert.equal(await page.locator(`[data-call-id="${call.callId}"]`).count(),0)
    await page.locator('.api-call summary').click()
    assert.ok((await page.locator('.api-call').innerText()).includes('check-health'))
    assert.equal(await page.locator('.api-call [data-trace-jump="llm"]').count(),0)
    report.agentIsolation=true;report.behaviorNodeWithoutLlm=true
    await page.locator('a.agent-back').click();await page.waitForTimeout(300)
    const count=debug.length;await page.waitForTimeout(1500);assert.equal(debug.length,count)
    report.unmountedPollingStopped=true;report.errors=errors;assert.deepEqual(errors,[]);report.passed=true
  }finally{
    await browser?.close();await fs.writeFile(path.join(directory,'results.json'),JSON.stringify(report,null,2))
    if(!process.argv.includes('--serve') || !report.passed)await preview.close()
    else {console.log('Trace preview: '+preview.origin+'/agents/Trace-A (synthetic data, no Minecraft/model calls)');process.on('SIGINT',()=>preview.close());process.on('SIGTERM',()=>preview.close())}
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={startPreview}
