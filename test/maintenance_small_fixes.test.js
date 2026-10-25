const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events')
const read=file=>fs.readFileSync(path.join(__dirname,'../src/web/public',file),'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'')
test('reload rejects HTTP and application errors and does not perform the success refresh',async()=>{
 for(const response of [{ok:false,status:500,json:async()=>({error:'reload failed'})},{ok:true,status:200,json:async()=>({ok:false,error:'reload failed'})},{ok:false,status:500,json:async()=>{throw Error('HTML')}}]){
  let calls=0
  const context=vm.createContext({fetch:async()=>{calls++;return response},setTimeout(){throw Error('Must not delay after failed reload')},setState(){},getState(){},receivedAgents(){}})
  vm.runInContext(read('lib/api.js'),context)
  await assert.rejects(context.reloadConfig(),/reload failed|Config reload failed/);assert.equal(calls,1)
 }
})
test('reload success refreshes status, while failed status does not mutate cached state',async()=>{
 let calls=0,updates=0
 const context=vm.createContext({fetch:async()=>++calls===1?{ok:true,json:async()=>({ok:true})}:{ok:false,json:async()=>({error:'status failed'})},setTimeout:fn=>fn(),setState(){updates++},getState:()=>({agents:[]}),receivedAgents:a=>a})
 vm.runInContext(read('lib/api.js'),context)
 await assert.rejects(context.reloadConfig(),/status failed/);assert.equal(updates,0)
 calls=0;context.fetch=async()=>++calls===1?{ok:true,json:async()=>({ok:true})}:{ok:true,json:async()=>({agents:[],uptimeSec:1})}
 await context.reloadConfig();assert.equal(updates,1)
})
test('Configs distinguishes a saved file from failed reload',async()=>{
 const editor={value:'{}',isConnected:true},status={},button={addEventListener(){}},container={querySelector:s=>s==='#config-editor'?editor:s==='#config-status'?status:button}
 const context=vm.createContext({console:{error(){}},fetchEnvConfig:async()=>({config:{}}),saveEnvConfig:async()=>{},reloadConfig:async()=>{throw Error('reload rejected')}})
 vm.runInContext(read('pages/configs.js'),context);context.renderConfigs(container);await new Promise(r=>setImmediate(r))
 await context.saveConfig({shouldReload:true});assert.match(status.textContent,/Saved, but reload\/status refresh failed/)
})
test('logs isolate special agent names and retain each independent 200-entry limit',()=>{
 const context=vm.createContext({});vm.runInContext(read('lib/state.js'),context)
 for(const name of ['__proto__','constructor','toString','A'])for(let i=0;i<205;i++)context.addLog(name,'cmd-done',{command:String(i)})
 const logs=context.getState().logs;assert.equal(Object.getPrototypeOf(logs),null)
 for(const name of ['__proto__','constructor','toString','A']){assert.equal(logs[name].length,200);assert.equal(logs[name][0].command,'5')}
 assert.notEqual(logs.A,logs.constructor)
})
test('natural follow end clears its own display/source and cannot clobber a successor',async()=>{
 const {handler}=require('../src/commands/actions/follow')
 const target={position:{x:1,y:70,z:2}},goals=[],bot=Object.assign(new EventEmitter(),{players:{A:{username:'A',entity:target}},pathfinder:{setGoal:g=>goals.push(g)}})
 const agent={bot,connected:true,currentAction:'follow',backgroundSource:'brain',eventBus:new EventEmitter()}
 await handler(bot,['A'],agent);const stale=bot.listeners('entityGone')[0]
 bot.emit('entityGone',{});assert.equal(agent.currentAction,'follow')
 bot.emit('entityGone',target);assert.equal(agent.currentAction,'Idle');assert.equal(agent.backgroundSource,null);assert.equal(bot.listenerCount('entityGone'),0)
 await handler(bot,['A'],agent);agent.currentAction='move';agent.backgroundSource='manual';const count=goals.length
 stale(target);assert.equal(agent.currentAction,'move');assert.equal(agent.backgroundSource,'manual');assert.equal(goals.length,count)
 bot._followCleanup();bot.pathfinder.setGoal=()=>{throw Error('pathfinder failed')}
 const failed=await handler(bot,['A'],agent);assert.equal(failed.ok,false);assert.match(failed.error,/pathfinder failed/);assert.equal(bot.listenerCount('entityGone'),0);assert.equal(bot._followCleanup,null)
})
