const test = require('node:test')
const assert = require('node:assert/strict')
const { handler } = require('../src/commands/actions/look')
const { loadCommands } = require('../src/commands')
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`)
for (const [degrees, radians] of [[0,Math.PI],[90,Math.PI/2],[-90,3*Math.PI/2],[180,2*Math.PI]]) {
  test(`look angle Minecraft yaw ${degrees}`, async () => {
    const bot = { look: async (yaw,pitch)=>{near(yaw,radians);near(pitch,0)} }
    assert.equal((await handler(bot,['angle',String(degrees),'0'])).ok,true)
  })
}
test('look angle pitch is positive down and relative values use current view with clamping', async () => {
  const bot={entity:{yaw:Math.PI,pitch:-Math.PI/6},look:async(y,p)=>{bot.last=[y,p]}}
  await handler(bot,['angle','~90','~-60']);near(bot.last[0],Math.PI/2);near(bot.last[1],Math.PI/6)
  await handler(bot,['angle','~','~100']);near(bot.last[1],-Math.PI/2)
  await handler(bot,['angle','450','30']);near(bot.last[0],Math.PI/2);near(bot.last[1],-Math.PI/6)
})
test('look at resolves mixed relative world coordinates from current feet, not eye height', async () => {
  const bot={entity:{position:{x:-10,y:64,z:2}},lookAt:async p=>{bot.target=p}}
  await handler(bot,['at','~1','~1.6','20']);assert.deepEqual({...bot.target},{x:-9,y:65.6,z:20})
  bot.entity.position={x:5,y:70,z:-8}
  await handler(bot,['at','~','~','~3']);assert.deepEqual({...bot.target},{x:5,y:70,z:-5})
})
test('look rejects legacy formats and malformed relative values without any side effects', async () => {
  const bot=new Proxy({}, {get(){throw Error('must not access bot')}})
  for(const args of [['0','0'],['turn','90','0'],['angle','~NaN','0'],['angle','^1','0'],['angle','0','91'],['at','~','~'],['at','Infinity','0','0'],['at','~','0','0','extra']]) {
    assert.equal((await handler(bot,args)).errorCode,'INVALID_ARGUMENTS')
  }
  assert.equal(loadCommands().commands.lookat,undefined)
})
