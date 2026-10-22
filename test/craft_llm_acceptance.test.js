const test = require('node:test')
const assert = require('node:assert/strict')
const { cases, stressCases, safeCommand, assess, serverCount, targetsOf, terminalState } = require('../scripts/craft-llm-acceptance')

test('craft LLM acceptance allowlists commands and rejects unrelated/multiple actions', () => {
  for (const command of ['inventory', 'recipes white_bed', 'craft oak_planks', 'craft stick 2 auto', 'craft iron_ingot 1 auto 2', 'say DONE', 'say BLOCKED']) assert.ok(safeCommand(command))
  for (const command of [null, 'give diamond', 'craft stick 2; stop', 'inventory\ncraft stick', 'goto 0 0 0', 'say any other text']) assert.equal(safeCommand(command), false)
})

test('stress acceptance requires all simultaneous targets and distinguishes correct resource refusal', () => {
  const transport = stressCases.find(row => row.id === 'recycle-transport')
  const commands = ['recipes hopper', 'recipes chest_minecart', 'say DONE']
  assert.ok(Object.values(assess(transport, [{ name: 'hopper', count: 1 }, { name: 'chest_minecart', count: 1 }], commands)).every(Boolean))
  assert.equal(assess(transport, [{ name: 'hopper', count: 1 }], commands).targetPassed, false)
  const blocked = stressCases.find(row => row.expectedBlocked)
  assert.ok(Object.values(assess(blocked, [], ['recipes anvil', 'say BLOCKED'])).every(Boolean))
  assert.equal(assess(blocked, [], ['recipes anvil', 'say DONE']).completionPassed, false)
})

test('terminal explanations are valid chat and must not create artificial refusal loops', () => {
  assert.ok(safeCommand('say BLOCKED: needs 31 ingots; only 27 available'))
  assert.equal(terminalState('say BLOCKED: needs 31 ingots'), 'BLOCKED')
  assert.equal(terminalState('say DONEfoo'), null)
  const blocked = stressCases.find(row => row.expectedBlocked)
  assert.ok(Object.values(assess(blocked, [], ['recipes anvil', 'say BLOCKED: insufficient iron'])).every(Boolean))
  assert.equal(safeCommand('say BLOCKED\ncraft iron_ingot'), false)
  for (const command of ['say BLOCKED：材料不足', 'say DONE，完成', 'SAY blocked: no materials']) {
    assert.ok(safeCommand(command));assert.ok(terminalState(command))
  }
  assert.equal(terminalState('say BLOCKED材料不足'),null)
  assert.equal(terminalState('say DONEfoo'),null)
  for (const command of ['recipes MINECRAFT:IRON_INGOT','craft iron_ingot 384 auto','craft iron_ingot 1 hand 0']) assert.ok(safeCommand(command))
})

test('stress fixtures use registered items and craftable targets for Minecraft 1.21.11', () => {
  const data = require('minecraft-data')('1.21.11'), { Recipe } = require('prismarine-recipe')(data)
  assert.equal(new Set(stressCases.map(row => row.id)).size, stressCases.length)
  for (const row of stressCases) {
    for (const [name, count] of Object.entries(row.inputs)) {
      assert.ok(data.itemsByName[name], name)
      assert.ok(Number.isInteger(count) && count > 0 && count <= 64)
    }
    for (const [name, count] of Object.entries(targetsOf(row))) {
      assert.ok(Recipe.find(data.itemsByName[name].id).length, name)
      assert.ok(Number.isInteger(count) && count > 0)
    }
  }
})

test('positive stress fixtures have a material-feasible witness, never supplied to the LLM', () => {
  const data = require('minecraft-data')('1.21.11'), { Recipe } = require('prismarine-recipe')(data)
  const witnesses = {
    'recycle-transport': [['iron_ingot', 2, 'iron_block'], ['oak_planks', 4], ['chest', 2, 'oak_planks'], ['minecart', 1], ['hopper', 1], ['chest_minecart', 1]],
    'dispenser-chain': [['oak_planks', 1], ['stick', 1, 'oak_planks'], ['bow', 1], ['redstone', 1, 'redstone_block'], ['dispenser', 1]],
    'mixed-wood-budget': [['oak_planks', 2], ['spruce_planks', 4], ['iron_ingot', 1, 'iron_nugget'], ['chest', 1, 'spruce_planks'], ['stick', 1, 'spruce_planks'], ['white_bed', 1, 'oak_planks'], ['shield', 1, 'spruce_planks'], ['wooden_pickaxe', 1, 'oak_planks']],
    'redstone-tight-budget': [['oak_planks', 3], ['stick', 3, 'oak_planks'], ['iron_ingot', 1, 'iron_block'], ['redstone', 2, 'redstone_block'], ['redstone_torch', 10], ['comparator', 2], ['repeater', 2], ['observer', 2], ['piston', 2, 'oak_planks'], ['sticky_piston', 2]],
    'bulk-iron-recycling': [['iron_ingot', 5, 'iron_block'], ['oak_planks', 12], ['chest', 6, 'oak_planks'], ['minecart', 2], ['hopper', 4], ['chest_minecart', 2], ['anvil', 2]],
    'powered-rail-384': [['gold_ingot', 43, 'gold_block'], ['redstone', 8, 'redstone_block'], ['oak_planks', 8], ['stick', 16, 'oak_planks'], ['powered_rail', 64]]
  }
  for (const scenario of stressCases.filter(row => !row.expectedBlocked)) {
    const inventory = new Map(Object.entries(scenario.inputs).map(([name, count]) => [data.itemsByName[name].id, count]))
    for (const [name, times, input] of witnesses[scenario.id]) {
      const recipe = Recipe.find(data.itemsByName[name].id).find(r => (!input || r.delta.some(d => d.id === data.itemsByName[input].id && d.count < 0))
        && r.delta.filter(d => d.count < 0).every(d => (inventory.get(d.id) || 0) >= -d.count * times))
      assert.ok(recipe, `${scenario.id}: ${name}`)
      for (const d of recipe.delta) inventory.set(d.id, (inventory.get(d.id) || 0) + d.count * times)
    }
    for (const [name, count] of Object.entries(targetsOf(scenario))) assert.equal(inventory.get(data.itemsByName[name].id), count, scenario.id)
  }
  const anvil = Recipe.find(data.itemsByName.anvil.id)[0]
  assert.equal(anvil.delta.filter(d => d.count < 0).reduce((n, d) => n - d.count * (d.id === data.itemsByName.iron_block.id ? 9 : 1), 0), 31)
  assert.equal(stressCases.find(row => row.expectedBlocked).inputs.iron_block * 9, 27)
})

test('server verification parses non-destructive clear-zero counts without guessing unknown responses', () => {
  assert.equal(serverCount('Found 8 matching items on player SteveX-Test'), 8)
  assert.equal(serverCount('No items were found on player SteveX-Test'), 0)
  assert.throws(() => serverCount('Connection error'))
})

test('craft LLM assessment requires observed exact output, query, completion and preserved resources', () => {
  const scenario = cases.find(row => row.id === 'iron-alternatives')
  const good = [{ name: 'iron_ingot', count: 1 }, { name: 'iron_block', count: 1 }]
  assert.ok(Object.values(assess(scenario, good, ['recipes iron_ingot', 'say DONE'])).every(Boolean))
  assert.equal(assess(scenario, [{ name: 'iron_ingot', count: 9 }], ['say DONE']).targetPassed, false)
  assert.equal(assess(scenario, [], ['say DONE']).preservedPassed, false)
  assert.equal(assess(scenario, good, ['say DONE']).recipeInformationPassed, false)
})
