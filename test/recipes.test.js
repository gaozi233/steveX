const test = require('node:test')
const assert = require('node:assert/strict')
const { handler } = require('../src/commands/queries/recipes')
function fixture() {
  const registry=require('minecraft-data')('1.21.11'),{Recipe}=require('prismarine-recipe')(registry)
  return {registry,recipesAll:(id,metadata,table)=>{assert.equal(table,true);return Recipe.find(id,metadata)}}
}
test('recipes returns every catalog alternative, independent of inventory, tables or unlocks',async()=>{
  const bot=fixture();bot._syncWindow=()=>{throw Error('query must not click')};bot.craft=()=>{throw Error('query must not craft')}
  const r=await handler(bot,['MINECRAFT:RED_BED'])
  assert.equal(r.ok,true);assert.equal(r.recipeCount,bot.recipesAll(bot.registry.itemsByName.red_bed.id,null,true).length)
  assert.equal(r.recipes.length,r.recipeCount);assert.ok(r.recipeCount>1);assert.equal(r.unlockedOnly,false)
  assert.equal(r.quantitiesPerExecution,true)
  assert.equal(r.recipeType,'crafting');assert.equal(r.availabilityChecked,false)
  assert.deepEqual(JSON.parse(r.output).recipes,r.recipes)
  assert.ok(r.recipes.some(recipe=>recipe.requiresWorkbench&&recipe.ingredients.some(i=>i.item==='red_wool'&&i.count===3)))
  assert.ok(r.recipes.some(recipe=>recipe.ingredients.some(i=>i.item==='red_dye')))
  for(const recipe of r.recipes){assert.equal('missingMaterials' in recipe,false);assert.equal('craftableNow' in recipe,false);assert.equal('selected' in recipe,false)}
})

test('recipes validates exact input and reports catalog failure without inventing empty recipes', async () => {
  const bot=fixture()
  for(const args of [[''],['minecraft:'],['other:oak_planks'],[null],['oak_planks','1']]) {
    const r=await handler(bot,args);assert.equal(r.errorCode,'INVALID_ARGUMENTS');assert.equal(r.output,r.error)
  }
  for(const name of ['__proto__','constructor','bed']) assert.equal((await handler(bot,[name])).errorCode,'UNKNOWN_ITEM')
  bot.recipesAll=()=>{throw Error('catalog unavailable')}
  const r=await handler(bot,['stone']);assert.equal(r.errorCode,'RECIPE_CATALOG_UNAVAILABLE');assert.equal('recipes' in r,false)
})
test('recipes rejects unknown or generic names and extra arguments without assuming red bed',async()=>{
  const bot=fixture()
  for(const args of [[],['bed'],['not_an_item'],['white_bed','red_bed']])assert.equal((await handler(bot,args)).ok,false)
  assert.equal((await handler(bot,['white_bed'])).item,'white_bed')
})
test('known items with no catalog crafting recipes return an empty list, not missing materials',async()=>{
  const r=await handler(fixture(),['stone']);assert.equal(r.ok,true);assert.equal(r.recipeCount,0);assert.deepEqual(r.recipes,[])
})
test('per-execution quantities are positive; absent catalog return data stays unknown',async()=>{
  const bot=fixture(),planks=await handler(bot,['oak_planks']),cake=await handler(bot,['cake'])
  assert.equal(planks.recipes[0].outputCount,4);assert.equal(planks.recipes[0].ingredients[0].count,1)
  assert.ok(cake.recipes.every(r=>r.returns===null))
  assert.ok(cake.recipes.every(r=>!r.ingredients.some(i=>i.item==='bucket')))
})
test('unsupported execution forms remain visible with complete gross inputs',async()=>{
  const bot=fixture(),id=bot.registry.itemsByName.oak_planks.id
  bot.recipesAll=()=>[{result:{id,count:1},ingredients:[{id,count:2}],delta:[{id,count:-1}],requiresTable:false}]
  const r=await handler(bot,['oak_planks']);assert.equal(r.recipeCount,1);assert.equal(r.recipes[0].supportedByCraft,false);assert.equal(r.recipes[0].ingredients[0].count,2)
})
