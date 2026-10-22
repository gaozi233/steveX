const { recipeView } = require('../crafting_recipe_view')

module.exports = {
  name: 'recipes',
  description: 'Read ALL catalog crafting recipes for ONE exact item name; per-execution ingredients, yields, returns and table requirements; no plan selection or global resource availability claims',
  usage: 'recipes <itemName>',
  async handler(bot, args) {
    const failure = (errorCode, error) => ({ ok: false, errorCode, error, output: error })
    if (args.length !== 1 || typeof args[0] !== 'string' || !/^(?:minecraft:)?[a-z0-9_]+$/i.test(args[0])) return failure('INVALID_ARGUMENTS', 'Usage: recipes <itemName> (one exact registry name, optional minecraft: prefix)')
    const name = args[0].toLowerCase().replace(/^minecraft:/, '')
    const item = Object.hasOwn(bot.registry.itemsByName, name) ? bot.registry.itemsByName[name] : null
    if (!item) return failure('UNKNOWN_ITEM', `Unknown item: ${name}; use an exact registry item name`)
    // Include table recipes regardless of inventory, proximity or unlock state.
    let recipes
    try { recipes = bot.recipesAll(item.id, null, true).map((recipe, index) => recipeView(bot, item, recipe, index + 1)) }
    catch(e) { return failure('RECIPE_CATALOG_UNAVAILABLE', `Client crafting catalog unavailable: ${e.message}`) }
    const data = { item: item.name, source: 'client-crafting-recipe-catalog', recipeType: 'crafting', availabilityChecked: false, unlockedOnly: false, quantitiesPerExecution: true, returnInformation: 'catalog-declared-only; null means unknown, not none', recipeCount: recipes.length, recipes }
    return { ok: true, ...data, output: JSON.stringify(data) }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
