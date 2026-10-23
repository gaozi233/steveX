const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { handler } = require('../src/commands/queries/nearby')
const registry = require('prismarine-registry')('1.21.11')

function fixture() {
  const body = { id: 1, position: new Vec3(0, 64, 0) }
  const key = registry.entitiesByName.cow.metadataKeys.indexOf('custom_name')
  const entities = { 1: body, 2: { id: 2, name: 'cow', type: 'animal', position: new Vec3(3, 64, 0),
    metadata: { [key]: { type: 'string', value: 'Alpha Cow' } } },
  3: { id: 3, name: 'pig', type: 'animal', position: new Vec3(0, 68, 0) },
  4: { id: 4, name: 'sheep', type: 'animal', position: new Vec3(4.001, 64, 0) } }
  return { bot: { entity: body, entities, registry } }
}

test('nearby includes exact radius, excludes just outside it and uses vertical distance', async () => {
  const agent = fixture()
  const result = await handler(agent.bot, ['ALL', '4'], agent)
  assert.deepEqual(result.entities.map(e => e.id), [2, 3])
  assert.deepEqual(result.entities.map(e => e.distance), [3, 4])
  assert.equal((await handler(agent.bot, ['alpha', '4'], agent)).entities[0].name, 'Alpha Cow')
  assert.equal((await handler(agent.bot, ['minecraft:COW', '4'], agent)).entities[0].entityName, 'cow')
})

test('nearby truncates after sorting, orders ties by id, excludes self id copies and rejects invalid radii', async () => {
  const agent = fixture()
  agent.bot.entities = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [i + 10,
    { id: i + 10, name: 'pig', position: new Vec3(1, 64, 0) }]).reverse())
  agent.bot.entities.self = { ...agent.bot.entity }
  assert.deepEqual((await handler(agent.bot, ['all', '1'], agent)).entities.map(e => e.id), Array.from({ length: 20 }, (_, i) => i + 10))
  for (const radius of ['0', '129', '2.5', '10x', 'Infinity', '-1']) assert.equal((await handler(agent.bot, ['all', radius], agent)).ok, false)
})

test('nearby exposes compact dropped/frame items and projectile state; item names are searchable', async () => {
  const agent=fixture(),Item=require('prismarine-item')(registry)
  const add=(id,name,values)=>{
    const metadata={}
    for(const [key,value] of Object.entries(values)) metadata[registry.entitiesByName[name].metadataKeys.indexOf(key)]=value
    agent.bot.entities[id]={id,name,type:'other',position:new Vec3(id-5,64,0),metadata}
  }
  const raw=Item.toNotch(new Item(registry.itemsByName.diamond.id,3))
  add(6,'item',{item:raw})
  add(7,'item_frame',{item:raw,rotation:2})
  add(8,'arrow',{in_ground:true})
  const result=await handler(agent.bot,['diamond','32'],agent)
  assert.deepEqual(result.entities.map(e=>e.item),[{name:'diamond',count:3},{name:'diamond',count:3}])
  assert.equal(result.entities[1].rotationDegrees,90)
  assert.match(result.output,/diamond x3/)
  const arrow=(await handler(agent.bot,['arrow'],agent)).entities[0]
  assert.equal(arrow.inGround,true);assert.equal(Object.hasOwn(arrow,'item'),false)
  agent.bot.entities[8].metadata={}
  assert.equal(Object.hasOwn((await handler(agent.bot,['arrow'],agent)).entities[0],'inGround'),false)
  agent.bot.entities[6].metadata={}
  assert.equal(Object.hasOwn((await handler(agent.bot,['minecraft:item'],agent)).entities[0],'item'),false)
})
