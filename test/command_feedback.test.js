const test=require('node:test'),assert=require('node:assert/strict')
const {formatCommandResult}=require('../src/agent/command_feedback')
test('LLM feedback retains uncertain hit, requested state and all structured error details',()=>{
 const r={ok:true,action:'attack',status:'requested',confirmed:false,hit:null,evidence:[],output:'Attack sent'}
 assert.deepEqual(JSON.parse(formatCommandResult(r)),{ok:true,action:'attack',status:'requested',confirmed:false,hit:null,evidence:[],message:'Attack sent'})
 const f={ok:false,errorCode:'CHOICE_REQUIRED',error:'Choose recipe',candidates:[{index:2}],nextQuery:'recipes stick',changes:[{delta:1}],output:'Partial result'}
 const actual=JSON.parse(formatCommandResult(f));for(const key of Object.keys(f).filter(k=>k!=='output'))assert.deepEqual(actual[key],f[key])
})
test('LLM feedback does not repeat structured query JSON or truncate large results',()=>{
 const r={ok:true,slots:Array.from({length:46},(_,slot)=>({slot,text:'x'.repeat(100)}))};r.output=JSON.stringify(r)
 const actual=JSON.parse(formatCommandResult(r));assert.equal(actual.message,undefined);assert.equal(actual.slots.length,46);assert.equal(formatCommandResult({ok:true,value:1n}),'{"ok":true,"value":"1"}')
})
