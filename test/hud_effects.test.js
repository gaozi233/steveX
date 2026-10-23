const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const hp=require('../src/commands/queries/hp').handler,hunger=require('../src/commands/queries/hunger').handler
const {hudEffectsPlugin}=require('../src/agent/hud_effects')
function fixture(){const b=new EventEmitter();b.entity={effects:{}};b.registry=require('minecraft-data')('1.21.11');hudEffectsPlugin(b);return b}
test('HUD effects are scoped to query and own entity; duration estimates update and disappear on removal',async()=>{
 const b=fixture(),ids=b.registry.effectsByName
 const add=(name,duration,amplifier=0)=>{const e={id:ids[name].id,duration,amplifier};b.entity.effects[e.id]=e;b.emit('entityEffect',b.entity,e);return e}
 const regen=add('Regeneration',200,1);add('Poison',100);add('Wither',80);add('Hunger',600)
 const health=await hp(b,[]);assert.deepEqual(health.effects.map(e=>e.name),['poison','regeneration','wither'])
 assert.equal(health.effects.find(e=>e.name==='regeneration').level,2)
 for(let i=0;i<20;i++)b.emit('physicsTick')
 assert.equal((await hp(b,[])).effects.find(e=>e.name==='regeneration').durationSeconds,9)
 assert.equal((await hunger(b,[])).effects[0].name,'hunger')
 delete b.entity.effects[regen.id]
 assert.equal((await hp(b,[])).effects.some(e=>e.name==='regeneration'),false)
 b.entity.effects={};assert.equal(Object.hasOwn(await hp(b,[]),'effects'),false);assert.doesNotMatch((await hunger(b,[])).output,/Effects/)
 b.emit('end');assert.equal(b.listenerCount('entityEffect'),0)
})
test('infinite, unknown and cached durations do not pretend to be realtime',async()=>{
 const b=fixture(),id=b.registry.effectsByName.Regeneration.id
 b.entity.effects[id]={id,amplifier:0,duration:-1}
 assert.equal((await hp(b,[])).effects[0].infinite,true)
 b.entity.effects[id]={id,amplifier:0,duration:100};b.emit('entityEffect',{},b.entity.effects[id]);b.emit('physicsTick')
 assert.equal((await hp(b,[])).effects[0].durationSource,'last-known')
 b.entity.effects[id]={id,amplifier:0};assert.equal((await hp(b,[])).effects[0].durationSeconds,null)
 b.emit('end')
})
