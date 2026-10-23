const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { loadCommands } = require('../src/commands')
const { Brain } = require('../src/agent/brain')
const { handler } = require('../src/commands/actions/right')
function fixture() {
  const bot = new EventEmitter()
  const item = {name:'shield',type:1,count:1}
  bot.heldItem=item
  bot.inventory=Object.assign(new EventEmitter(),{slots:Array(46).fill(null)})
  bot.inventory.slots[45]=item
  bot.getEquipmentDestSlot=()=>45
  bot.activateItem=off=>{bot.usedOffhand=off;bot.usingHeldItem=true}
  bot.deactivateItem=()=>{bot.releases=(bot.releases||0)+1;bot.usingHeldItem=false}
  return bot
}
for(const hand of ['hand','off-hand']) test(`right up reports actual ${hand}, then idempotent no-use`,async()=>{
  const bot=fixture()
  assert.equal((await handler(bot,['down',hand])).ok,true)
  const result=await handler(bot,['up'])
  assert.equal(result.action,'right');assert.equal(result.operation,'up')
  assert.equal(result.hadActiveUse,true);assert.equal(result.released,true);assert.equal(result.hand,hand)
  assert.equal(result.confirmed,false);assert.match(result.output,/unconfirmed/)
  const again=await handler(bot,['up'])
  assert.equal(again.released,false);assert.equal(again.hadActiveUse,false);assert.equal(again.hand,null)
  assert.equal(bot.releases,1)
})
test('untracked native use releases with unknown hand instead of guessing',async()=>{
  const bot=fixture();bot.usingHeldItem=true
  const result=await handler(bot,['up'])
  assert.equal(result.released,true);assert.equal(result.hand,null);assert.equal(result.hadActiveUse,true)
})
test('invalid right syntax does not release active use; old top-level names are absent',async()=>{
  const bot=fixture();await handler(bot,['down','off-hand'])
  for(const args of [[],['up','hand'],['up','off-hand'],['down','left'],['click','hand','extra'],['typo']]) assert.equal((await handler(bot,args)).errorCode,'INVALID_ARGUMENTS')
  assert.equal(bot.releases,undefined)
  const {commands}=loadCommands(),brain=new Brain({}, {}, {})
  for(const name of ['rightclick','rightdown','rightup']) {assert.equal(commands[name],undefined);assert.equal(brain.pickCommand(name),null)}
  assert.equal(brain.pickCommand('right up'),'right up')
  await handler(bot,['up'])
})
