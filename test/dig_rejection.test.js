const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{Vec3}=require('vec3')
const {digConfirmed}=require('../src/commands/operation_result')
function fixture(){
  const position=new Vec3(5,70,109),original={position,stateId:100,type:10,name:'birch_log'}
  let current=original,repairs=0
  const bot={_client:new EventEmitter(),blockAt:()=>current,
    _updateBlockState(p,state){assert.ok(p.equals(position));assert.equal(state,100);repairs++;current=original}}
  return {bot,original,predictAir:()=>{current={position,stateId:0,type:0,name:'air'}},repairs:()=>repairs}
}
test('dig failure replays observed server rejection after a later local air prediction, without claiming success',async()=>{
  const f=fixture()
  f.bot.dig=async()=>{f.bot._client.emit('block_change',{location:f.original.position,type:100});f.predictAir()}
  const result=await digConfirmed(f.bot,f.original)
  assert.equal(result.ok,false);assert.equal(result.errorCode,'DIG_NOT_CONFIRMED')
  assert.equal(result.clientStateRestored,true);assert.equal(f.repairs(),1)
  assert.equal(f.bot.blockAt().name,'birch_log');assert.equal(result.serverObservation.unchanged,true)
  assert.deepEqual(result.evidence,['server-block-update-unchanged'])
  assert.equal(f.bot._client.listenerCount('block_change'),0)
})
test('dig never repairs prediction from an old cache alone when no server update arrived',async()=>{
  const f=fixture();f.bot.dig=async()=>f.predictAir()
  const result=await digConfirmed(f.bot,f.original)
  assert.equal(result.ok,false);assert.equal(result.serverObservation,undefined)
  assert.equal(f.repairs(),0);assert.equal(f.bot.blockAt().name,'air')
  assert.equal(f.bot._client.listenerCount('multi_block_change'),0)
})
