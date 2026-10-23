const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const findplayer = require('../src/commands/queries/findplayer')
const findblock = require('../src/commands/queries/findblock')

test('findplayer matches case-insensitive substrings, prioritizes exact names and never fabricates unloaded positions', async () => {
  const bot = { players: { far: { username: 'AlphaFar', ping: 0 }, near: { username: 'Alpha', entity: { position: new Vec3(-0.01, 64, 1.25) } } } }
  const result = await findplayer.handler(bot, ['ALPHA'])
  assert.deepEqual(result.players.map(p => p.name), ['Alpha', 'AlphaFar'])
  assert.deepEqual(result.players[0].position, { x: -0.01, y: 64, z: 1.25 })
  assert.match(result.output, /0.0 64.0 1.3/)
  assert.equal(result.players[1].loaded, false)
  assert.equal(Object.hasOwn(result.players[1], 'position'), false)
  assert.deepEqual((await findplayer.handler(bot, ['missing'])).players, [])
  assert.equal((await findplayer.handler(bot, [])).ok, false)
})

test('findblock validates full radius, supports namespaced names and air id zero, with a consistent block-grid origin', async () => {
  let options
  const bot = { version: '1.21.11', entity: { position: new Vec3(-0.01, 64, 1.25) },
    findBlock: input => { options = input; return { name: 'air', position: new Vec3(-1, 64, 1) } } }
  const result = await findblock.handler(bot, ['Minecraft:AIR', '1'], { bot })
  assert.equal(result.found, true); assert.equal(options.matching, 0)
  assert.deepEqual(options.point, new Vec3(-1, 64, 1)); assert.equal(result.distance, 0)
  for (const radius of ['0', '129', '1.5', '8abc', 'Infinity']) assert.equal((await findblock.handler(bot, ['stone', radius], { bot })).ok, false)
  assert.equal((await findblock.handler(bot, ['nonexistent'], { bot })).ok, false)
  bot.findBlock = () => null
  const missing = await findblock.handler(bot, ['stone'], { bot })
  assert.equal(missing.found, false); assert.equal(missing.radius, 32)
})

test('findblock uses synchronized native tags, not guessed names; preserves real properties',async()=>{
  const {EventEmitter}=require('node:events'),{attachBlockTags}=require('../src/agent/block_tags')
  const registry=require('prismarine-registry')('1.21.11')
  const bot=Object.assign(new EventEmitter(),{_client:new EventEmitter(),registry,entity:{position:new Vec3(0,64,0)}})
  attachBlockTags(bot)
  assert.equal((await findblock.handler(bot,['#logs'],{bot})).errorCode,'TAG_DATA_UNAVAILABLE')
  const entries=['oak_log','birch_log','spruce_log'].map(n=>registry.blocksByName[n].id)
  bot._client.emit('tags',{tags:[{tagType:'minecraft:block',tags:[{tagName:'minecraft:logs',entries},{tagName:'minecraft:empty',entries:[]}]}]})
  let options
  bot.findBlock=o=>{options=o;return {name:'birch_log',position:new Vec3(1,64,0),getProperties:()=>({axis:'x'})}}
  const result=await findblock.handler(bot,['#minecraft:logs'],{bot})
  assert.deepEqual(options.matching,entries);assert.equal(result.block,'birch_log');assert.deepEqual(result.properties,{axis:'x'})
  assert.equal(Object.hasOwn(result,'stateId'),false)
  assert.match(result.output,/birch_log\[axis=x\]/)
  assert.equal((await findblock.handler(bot,['#unknown'],{bot})).errorCode,'UNKNOWN_BLOCK_TAG')
  assert.equal((await findblock.handler(bot,['#empty'],{bot})).found,false)
  assert.equal((await findblock.handler(bot,['log'],{bot})).errorCode,'UNKNOWN_BLOCK')
  bot._client.emit('tags',{tags:[{tagType:'minecraft:block',tags:[]}]})
  assert.equal((await findblock.handler(bot,['#logs'],{bot})).errorCode,'UNKNOWN_BLOCK_TAG')
  bot.emit('end');assert.equal(bot._client.listenerCount('tags'),0)
})

test('exact beds, stairs and slabs match type IDs regardless of color-specific states',async()=>{
  const registry=require('prismarine-registry')('1.21.11'),Block=require('prismarine-block')(registry)
  for(const [name,properties] of [
    ['red_bed',{facing:'north',part:'head',occupied:true}],['white_bed',{facing:'west',part:'foot',occupied:false}],
    ['oak_stairs',{facing:'east',half:'top',shape:'inner_left',waterlogged:true}],
    ['oak_stairs',{facing:'south',half:'bottom',shape:'straight',waterlogged:false}],
    ['oak_slab',{type:'top',waterlogged:true}]]){
    const block=Block.fromProperties(name,properties,0);block.position=new Vec3(1,64,0)
    const bot={registry,entity:{position:new Vec3(0,64,0)},findBlock:options=>{assert.equal(options.matching,registry.blocksByName[name].id);return block}}
    const result=await findblock.handler(bot,[name],{bot})
    assert.equal(result.block,name);assert.deepEqual(result.properties,block.getProperties())
  }
})

test('findblock tag directory discovers and inspects without accessing the world',async()=>{
  const {EventEmitter}=require('node:events'),{attachBlockTags}=require('../src/agent/block_tags')
  const registry=require('prismarine-registry')('1.21.11')
  const bot=Object.assign(new EventEmitter(),{_client:new EventEmitter(),registry,findBlock:()=>assert.fail('directory must not search')})
  Object.defineProperty(bot,'entity',{get(){assert.fail('directory must not need position')}})
  attachBlockTags(bot)
  assert.equal((await findblock.handler(bot,['tags'],{bot})).errorCode,'TAG_DATA_UNAVAILABLE')
  const tags=[{tagName:'minecraft:logs',entries:['birch_log','oak_log'].map(n=>registry.blocksByName[n].id)},{tagName:'minecraft:empty',entries:[]}]
  bot._client.emit('tags',{tags:[{tagType:'minecraft:block',tags}]})
  const listed=await findblock.handler(bot,['TAGS','LOG'],{bot})
  assert.deepEqual(listed.tags,[{name:'#minecraft:logs',count:2}]);assert.equal(listed.truncated,false)
  const members=await findblock.handler(bot,['TAG','#logs'],{bot})
  assert.deepEqual(members.blocks,['birch_log','oak_log']);assert.equal(members.total,2)
  assert.deepEqual((await findblock.handler(bot,['tag','#empty'],{bot})).blocks,[])
  assert.equal((await findblock.handler(bot,['tag','#missing'],{bot})).errorCode,'UNKNOWN_BLOCK_TAG')
  assert.deepEqual((await findblock.handler(bot,['tags','no_match'],{bot})).tags,[])
  for(const args of [['tag'],['tag','logs'],['tags','log','32'],['tag','#logs','32'],['tags','bad filter']]) assert.equal((await findblock.handler(bot,args,{bot})).errorCode,'INVALID_ARGUMENTS')
  bot.emit('end')
})

test('findblock tag listing and member expansion explicitly report truncation and missing registry names',async()=>{
  const {EventEmitter}=require('node:events'),{attachBlockTags}=require('../src/agent/block_tags')
  const registry=require('prismarine-registry')('1.21.11'),bot=Object.assign(new EventEmitter(),{_client:new EventEmitter(),registry})
  attachBlockTags(bot)
  const tags=Array.from({length:55},(_,i)=>({tagName:`minecraft:test_${i}`,entries:[]}))
  tags.push({tagName:'minecraft:big',entries:[...registry.blocksArray.slice(0,130).map(b=>b.id),999999]})
  bot._client.emit('tags',{tags:[{tagType:'minecraft:block',tags}]})
  const list=await findblock.handler(bot,['tags'],{bot});assert.equal(list.returned,50);assert.equal(list.total,56);assert.equal(list.truncated,true)
  const big=await findblock.handler(bot,['tag','#big'],{bot});assert.equal(big.returned,128);assert.equal(big.total,131);assert.equal(big.truncated,true);assert.equal(big.unresolvedCount,1)
  assert.match(big.output,/truncated/);assert.match(big.output,/unresolved/)
  bot.emit('end')
})
