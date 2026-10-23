const test = require('node:test')
const assert = require('node:assert/strict')
const move = require('../src/commands/actions/move')
const jump = require('../src/commands/actions/jump')

function fixture(modern = true) {
  const packets = []
  return { packets, bot: { vehicle: {}, supportFeature: () => modern,
    _client: { write: (name, data) => packets.push({ name, data }) },
    getControlState: key => key === 'sneak' } }
}
test('vehicle directions release to neutral on both protocols without jump flags', async () => {
  for (const modern of [true, false]) for (const direction of ['forward', 'back', 'left', 'right']) {
    const { bot, packets } = fixture(modern)
    assert.equal((await move.handler(bot, [direction, '1'])).ok, true)
    assert.equal(packets.length, 2)
    const [start, end] = packets.map(p => p.data)
    if (modern) {
      assert.equal(start.inputs[direction === 'back' ? 'backward' : direction], true)
      assert.equal(end.inputs.shift, true)
      assert.equal(end.inputs.jump, false)
      for (const key of ['forward', 'backward', 'left', 'right']) assert.equal(end.inputs[key], false)
    } else {
      assert.equal(start.jump, 0)
      assert.deepEqual(end, { sideways: 0, forward: 0, jump: 0 })
    }
  }
})
test('vehicle cancellation releases inputs and invalid controls send nothing', async () => {
  const { bot, packets } = fixture()
  const controller = new AbortController()
  const pending = move.handler(bot, ['forward', '30000'], null, { signal: controller.signal })
  controller.abort()
  assert.equal((await pending).ok, false)
  assert.equal(packets.at(-1).data.inputs.forward, false)
  packets.length = 0
  for (const args of [['sprint'], ['left', '0'], ['diagonal']]) assert.equal((await move.handler(bot, args)).ok, false)
  assert.equal(packets.length, 0)
})
test('jump Space deploys elytra only when already airborne; old parameters reject', async () => {
  let calls = 0
  const bot = { entity:{onGround:false},inventory:{slots:[{name:'elytra'}]},getEquipmentDestSlot:()=>0,setControlState(){},elytraFly: async () => calls++ }
  const result = await jump.handler(bot, [])
  assert.equal(calls, 1)
  assert.equal(result.confirmed, false)
  assert.equal(result.status, 'requested')
  assert.equal((await jump.handler(bot, ['invalid'])).ok, false)
  assert.equal((await jump.handler(bot, ['glide'])).ok, false)
  assert.equal((await jump.handler(bot, ['normal'])).ok, false)
  assert.equal(calls, 1)
  const controls = []
  assert.equal((await jump.handler({ setControlState: (...args) => controls.push(args) }, [])).ok, true)
  assert.deepEqual(controls, [['jump', true], ['jump', false]])
})
test('standalone vehicle commands are absent', () => {
  const { commands } = require('../src/commands').loadCommands()
  assert.equal(commands.drive, undefined)
  assert.equal(commands.elytra, undefined)
})

test('jump duration validates before input; one press holds through landing without redeploying', async () => {
  let deploys=0
  const controls=[],bot={entity:{onGround:false},inventory:{slots:[{name:'elytra'}]},getEquipmentDestSlot:()=>0,setControlState:(...a)=>controls.push(a),elytraFly:async()=>{deploys++}}
  for(const value of ['0','-1','1.5','30001','Infinity','200ms']) assert.equal((await jump.handler(bot,[value])).errorCode,'INVALID_ARGUMENTS')
  assert.deepEqual(controls,[])
  const action=jump.handler(bot,['30'])
  bot.entity.onGround=true
  assert.deepEqual(controls,[['jump',true]])
  const result=await action
  assert.equal(result.durationMs,30);assert.equal(deploys,1)
  assert.deepEqual(controls,[['jump',true],['jump',false]])
})

test('Space stays an input-only press on ground, in fluid, riding, gliding or without usable wings', async () => {
  for(const mode of ['ground','water','lava','riding','gliding','no-wing','broken']) {
    const controls=[]
    const entity={onGround:mode==='ground',isInWater:mode==='water',isInLava:mode==='lava',elytraFlying:mode==='gliding'}
    const bot={entity,vehicle:mode==='riding'?{}:null,getEquipmentDestSlot:()=>0,inventory:{slots:[mode==='no-wing'?null:{name:'elytra',maxDurability:432,durabilityUsed:mode==='broken'?431:0}]},setControlState:(...a)=>controls.push(a),elytraFly:async()=>assert.fail('must not deploy'),activateItem:()=>assert.fail('must not use fireworks')}
    const result=await jump.handler(bot,[])
    assert.equal(result.ok,true);assert.equal(result.deploymentRequested,false)
    assert.deepEqual(controls,[['jump',true],['jump',false]])
  }
})

test('Space cancellation releases key, and rejected native deployment is not reported as flight', async () => {
  const controls=[],controller=new AbortController()
  const bot={setControlState:(...a)=>controls.push(a)}
  const work=jump.handler(bot,[],null,{signal:controller.signal});controller.abort()
  assert.equal((await work).ok,false);assert.deepEqual(controls.at(-1),['jump',false])
  Object.assign(bot,{entity:{onGround:false},inventory:{slots:[{name:'elytra'}]},getEquipmentDestSlot:()=>0,elytraFly:async()=>{throw Error('levitation')}})
  const result=await jump.handler(bot,[])
  assert.equal(result.deploymentRequested,false);assert.equal(result.confirmed,false);assert.equal(result.deploymentError,'levitation')
})
