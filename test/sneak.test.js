const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const {SteveXAgent}=require('../src/agent/agent'),{loadCommands}=require('../src/commands')
const {isSneakHeld}=require('../src/agent/sneak_state')
const sneak=require('../src/commands/actions/sneak').handler
function fixture(){
 const bot=new EventEmitter(),controls={forward:false,back:false,left:false,right:false,jump:false,sprint:false,sneak:false},changes=[]
 bot.setControlState=(k,v)=>{controls[k]=v;changes.push([k,v])};bot.getControlState=k=>controls[k]
 bot.clearControlStates=()=>{for(const k of Object.keys(controls))bot.setControlState(k,false)}
 bot.stopDigging=()=>{};bot.deactivateItem=()=>{};bot.pathfinder={setGoal:()=>bot.clearControlStates()}
 const loaded=loadCommands(),agent=new SteveXAgent({},'sneak-test',loaded.commands,{queryNames:loaded.queryNames});agent.bot=bot;agent.connected=true
 return {bot,agent,controls,changes}
}
test('sneak on persists without false pulses through movement, turning, stand and rightclick dispatch',async()=>{
 const f=fixture();f.bot.look=async()=>{};f.bot.lookAt=async()=>{}
 f.agent.commands.rightclick=async()=>({ok:true});f.agent.commands.goto=async()=>({ok:true});f.agent.commands.follow=async()=>({ok:true})
 await f.agent.executeCommand('sneak on');f.changes.length=0
 for(const c of ['move forward 1','look 0 0','lookat 1 2 3','stand','rightclick','goto 1 2 3','follow Other']){
  assert.equal((await f.agent.executeCommand(c)).ok,true,c);assert.equal(f.controls.sneak,true,c)
 }
 assert.equal(f.changes.some(([k,v])=>k==='sneak'&&!v),false)
 await f.agent.executeCommand('sneak off');assert.equal(f.controls.sneak,false);assert.equal(isSneakHeld(f.bot),false)
})
test('sneak tap releases after 150ms but does not release an existing hold',async()=>{
 const f=fixture();assert.equal((await sneak(f.bot,['tap'])).sneaking,false);assert.equal(f.controls.sneak,false)
 await sneak(f.bot,['on']);f.changes.length=0;assert.equal((await sneak(f.bot,['tap'])).changed,false)
 assert.equal(f.controls.sneak,true);assert.equal(f.changes.length,0);await sneak(f.bot,['off'])
})
test('stop and action timeout clear both the persistent intent and actual controls',async()=>{
 const f=fixture();await f.agent.executeCommand('sneak on');await f.agent.executeCommand('stop')
 assert.equal(f.controls.sneak,false);assert.equal(isSneakHeld(f.bot),false)
 await f.agent.executeCommand('sneak on');const r=await f.agent.executeCommand('move forward 30000',{timeoutMs:10})
 assert.equal(r.ok,false);assert.equal(f.controls.forward,false);assert.equal(f.controls.sneak,false);assert.equal(isSneakHeld(f.bot),false)
})
test('end restores upstream control setter; persistent state is isolated by bot',async()=>{
 const a=fixture(),b=fixture(),original=a.bot.setControlState;await sneak(a.bot,['on']);assert.equal(isSneakHeld(b.bot),false)
 a.bot.emit('end');assert.equal(a.bot.setControlState,original);assert.equal(isSneakHeld(a.bot),false)
})
test('invalid sneak and removed move sneak fail before controls or Brain change',async()=>{
 const f=fixture();f.agent.brainLoop={stop(){throw Error('invalid input must not stop Brain')}}
 for(const c of ['move sneak','sneak','sneak click','sneak on extra'])assert.equal((await f.agent.executeCommand(c)).errorCode,'INVALID_ARGUMENTS')
 assert.equal(f.changes.length,0)
})
