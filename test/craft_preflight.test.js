const test = require('node:test')
const assert = require('node:assert/strict')
const { diagnoseCraft, missingMaterials } = require('../src/commands/craft_preflight')
function fixture(inventory = {}) {
  const registry = require('minecraft-data')('1.21.11'), { Recipe } = require('prismarine-recipe')(registry)
  const items = Object.entries(inventory).map(([name, count]) => ({ ...registry.itemsByName[name], type: registry.itemsByName[name].id, count }))
  return { registry, inventory: { items: () => items }, recipesAll: id => Recipe.find(id) }
}
const diagnose = (bot, item, times=1, mode='auto', table=null, room=()=>true) => diagnoseCraft(bot,bot.registry.itemsByName[item],times,mode,table,room)
test('failed crafting requests recipe lookup, not a selected shortage or a global resource claim', () => {
  for(const [inventory,table] of [[{oak_planks:3,stick:2},null],[{oak_planks:2,stick:1},{}],[{},null]]) {
    const r=diagnose(fixture(inventory),'wooden_pickaxe',2,'auto',table).failure
    assert.equal(r.errorCode,'RECIPE_QUERY_REQUIRED');assert.equal(r.nextQuery,'recipes wooden_pickaxe')
    assert.equal('missingMaterials' in r,false);assert.equal('recipe' in r,false)
    assert.match(r.output,/Only current backpack and workstation/);assert.match(r.output,/not resources elsewhere/)
    assert.doesNotMatch(r.output,/choose a plan|memory|collect|remaining goal/i)
    assert.equal(r.phase,'preflight');assert.equal(r.effect,'none');assert.equal(r.producedCount,0)
    assert.deepEqual(r.availableRecipes,[])
    assert.deepEqual(r.changes,[])
  }
})

test('hand mode does not claim to have checked whether a nearby table exists', () => {
  const r = diagnose(fixture({iron_nugget:9}), 'iron_ingot', 1, 'hand').failure
  assert.deepEqual(r.workbench, {checked:false, available:null})
  const auto = diagnose(fixture({iron_nugget:9}), 'iron_ingot', 1, 'auto').failure
  assert.deepEqual(auto.workbench, {checked:true, available:false})
})
test('internal execution checks still respect full batch ingredient quantities', () => {
  const bot=fixture({oak_planks:2,stick:1}),recipe=bot.recipesAll(bot.registry.itemsByName.wooden_pickaxe.id).find(r=>r.delta.some(d=>d.id===bot.registry.itemsByName.oak_planks.id&&d.count<0))
  assert.deepEqual(missingMaterials(bot,recipe,2),[{item:'oak_planks',required:6,available:2,missing:4},{item:'stick',required:4,available:1,missing:3}])
})
test('capacity and explicit hand errors retain facts and still suggest recipe lookup', () => {
  const r=diagnose(fixture({oak_log:2}),'oak_planks',2,'auto',null,()=>false).failure
  assert.equal(r.errorCode,'INVENTORY_FULL');assert.equal(r.nextQuery,'recipes oak_planks');assert.equal('missingMaterials' in r,false)
  assert.equal(diagnose(fixture(),'wooden_pickaxe',1,'hand').failure.errorCode,'WORKBENCH_REQUIRED')
})
test('execution selects an actually available alternative, never ranks failed alternatives for planning', () => {
  const bot=fixture({iron_nugget:9})
  assert.equal(diagnose(bot,'iron_ingot').failure.errorCode,'RECIPE_QUERY_REQUIRED')
  assert.equal(diagnose(bot,'iron_ingot',1,'auto',{}).recipe.requiresTable,true)
  const block=fixture({iron_block:2});assert.ok(diagnose(block,'iron_ingot',2).recipe)
})
test('no catalog recipe and unsupported recipe remain separate from planning advice', () => {
  const bot=fixture();bot.recipesAll=()=>[]
  assert.equal(diagnose(bot,'stone').failure.errorCode,'NO_CRAFTING_RECIPE')
  const id=bot.registry.itemsByName.oak_planks.id;bot.recipesAll=()=>[{result:{count:1},delta:[{id,count:-1}]}]
  assert.equal(diagnose(bot,'oak_planks').failure.errorCode,'UNSUPPORTED_RECIPE')
})
test('internal ingredient validation respects metadata and excludes returned buckets', () => {
  const bot=fixture({milk_bucket:3,egg:1,wheat:3,sugar:2}),r=bot.recipesAll(bot.registry.itemsByName.cake.id)[0]
  assert.ok(!missingMaterials(bot,r,2).some(m=>m.item==='bucket'))
  const id=bot.registry.itemsByName.oak_log.id;bot.inventory.items=()=>[{type:id,count:2,metadata:1}]
  assert.equal(missingMaterials(bot,{delta:[{id,metadata:2,count:-1}]},1)[0].available,0)
})

test('ambiguous executable recipes require selection and selected catalog index never falls back', () => {
  const bot = fixture({ iron_block: 1, iron_nugget: 9 })
  const item = bot.registry.itemsByName.iron_ingot
  const all = bot.recipesAll(item.id)
  const nuggetIndex = all.findIndex(r => r.delta.some(d => d.id === bot.registry.itemsByName.iron_nugget.id && d.count < 0)) + 1
  const ambiguous = diagnoseCraft(bot, item, 1, 'auto', {}, () => true).failure
  assert.equal(ambiguous.errorCode, 'RECIPE_SELECTION_REQUIRED')
  assert.equal(ambiguous.availableRecipes.length, 2)
  assert.ok(ambiguous.availableRecipes.every(r => r.index === all.findIndex(recipe => recipe.result.count === r.outputCount) + 1))
  assert.match(ambiguous.output, /Current executable alternatives/)
  assert.ok(ambiguous.error.includes(JSON.stringify(ambiguous.availableRecipes)))
  assert.deepEqual(ambiguous.changes, [])
  assert.equal('nextQuery' in ambiguous, false)
  assert.doesNotMatch(ambiguous.error, /Query .* first/)
  const selected = diagnoseCraft(bot, item, 1, 'auto', {}, () => true, nuggetIndex)
  assert.equal(selected.recipeIndex, nuggetIndex)
  assert.equal(selected.recipe.result.count, 1)
  const unavailable = diagnoseCraft(bot, item, 2, 'auto', {}, () => true, nuggetIndex).failure
  assert.equal(unavailable.errorCode, 'RECIPE_QUERY_REQUIRED')
  assert.equal('availableRecipes' in unavailable, false)
  assert.equal(diagnoseCraft(bot, item, 1, 'auto', {}, () => true, 99999).failure.errorCode, 'INVALID_RECIPE_INDEX')
  assert.equal(diagnoseCraft(bot, item, 1, 'auto', null, () => true).recipe.result.count, 9)
  assert.equal(diagnoseCraft(bot, item, 1, 'auto', {}, (_b, r) => r.result.count === 1).recipe.result.count, 1)
})

test('available recipes use requested batch quantities and exclude absent ingredients', () => {
  const bot = fixture({ iron_block: 2, iron_nugget: 9 }), item = bot.registry.itemsByName.iron_ingot
  assert.equal(diagnoseCraft(bot, item, 2, 'auto', {}, () => true).recipe.result.count, 9)
  const onlyNuggets = fixture({ iron_nugget: 9 })
  assert.equal(diagnoseCraft(onlyNuggets, item, 1, 'auto', {}, () => true).recipe.result.count, 1)
})
