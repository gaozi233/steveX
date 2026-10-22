const { recipeView } = require('./crafting_recipe_view')

function missingMaterials(bot, recipe, times) {
  const requirements = new Map()
  for (const ingredient of recipe.delta.filter(d => d.count < 0)) {
    const key = `${ingredient.id}:${ingredient.metadata ?? '*'}`
    const entry = requirements.get(key) || { id: ingredient.id, metadata: ingredient.metadata, required: 0 }
    entry.required -= ingredient.count * times
    requirements.set(key, entry)
  }
  const inventory = bot.inventory.items()
  return [...requirements.values()].map(({ id, metadata, required }) => {
    const available = inventory.filter(i => i.type === id && (metadata == null || i.metadata === metadata)).reduce((n, i) => n + i.count, 0)
    return { item: bot.registry.items[id]?.name || `item_id_${id}`, required, available, missing: Math.max(0, required - available),
      ...(metadata == null ? {} : { metadata }) }
  }).filter(material => material.missing > 0)
}

function diagnoseCraft(bot, item, times, mode, table, hasRoom, recipeIndex) {
  // recipesAll's third argument only includes table recipes in its catalog;
  // true here is a metadata filter, never a table supplied to bot.craft.
  const all = bot.recipesAll(item.id, null, true)
  const indexed = all.map((recipe, index) => ({ recipe, index: index + 1 }))
  const chosen = recipeIndex === undefined ? indexed : indexed.filter(c => c.index === recipeIndex)
  const supported = chosen.filter(({ recipe: r }) => r.delta.filter(d => d.id === item.id).reduce((n, d) => n + d.count, 0) === r.result.count)
  const target = { item: item.name, requestedExecutions: times, station: mode, ...(recipeIndex === undefined ? {} : { recipeIndex }) }
  const failure = (code, message) => {
    const nextQuery = `recipes ${item.name}`
    const output = `Cannot craft ${item.name} (${times} executions): ${message}. Nothing crafted. Catalog query: ${nextQuery}. Only current backpack and workstation execution conditions were checked, not resources elsewhere.`
    return { ok: false, errorCode: code, error: output, output, nextQuery, target, phase: 'preflight', effect: 'none', completedExecutions: 0, producedCount: 0, changes: [], evidence: ['server-inventory-snapshot', 'recipe-catalog'],
      workbench: { checked: mode !== 'hand', available: mode === 'hand' ? null : !!table } }
  }
  if (!all.length) return { failure: failure('NO_CRAFTING_RECIPE', 'no crafting recipe in this client catalog') }
  if (!chosen.length) return { failure: failure('INVALID_RECIPE_INDEX', 'recipeIndex is not in this item catalog; query the current catalog again') }
  if (!supported.length) return { failure: failure('UNSUPPORTED_RECIPE', 'recipe output is also consumed; this recipe form is unsupported') }
  const candidates = supported.map(({ recipe, index }) => ({ recipe, index, missing: missingMaterials(bot, recipe, times), accessible: mode === 'table' ? !!table : !recipe.requiresTable || (mode !== 'hand' && !!table) }))
  const eligible = mode === 'hand' ? candidates.filter(c => !c.recipe.requiresTable) : candidates
  if (!eligible.length) return { failure: failure('WORKBENCH_REQUIRED', 'hand mode cannot execute a table recipe; use auto or table mode') }
  const ready = eligible.filter(c => c.accessible && c.missing.length === 0).sort((a, b) => Number(a.recipe.requiresTable) - Number(b.recipe.requiresTable) || a.index - b.index)
  const fitting = ready.filter(c => hasRoom(bot, c.recipe, times))
  if (recipeIndex === undefined && fitting.length > 1) {
    const availableRecipes = fitting.map(c => ({ ...recipeView(bot, item, c.recipe, c.index), totalOutputCount: c.recipe.result.count * times }))
    const result = failure('RECIPE_SELECTION_REQUIRED', 'multiple recipes are executable; select recipeIndex using craft <itemName> <times> <auto|hand|table> <recipeIndex>; nothing crafted')
    const detail = ` Current executable alternatives for this requested batch (not the full catalog): ${JSON.stringify(availableRecipes)}`
    result.error = result.output = `Nothing crafted: multiple recipes are currently executable. Choose an index from availableRecipes using craft ${item.name} ${times} ${mode} <recipeIndex>.${detail}`
    delete result.nextQuery
    return { failure: { ...result, availableRecipes, availabilitySource: 'current-backpack-workstation-and-capacity', quantitiesPerExecution: true } }
  }
  const selected = fitting[0]
  if (selected) return { recipe: selected.recipe, recipeIndex: selected.index, table: mode === 'table' || selected.recipe.requiresTable ? table : null }
  if (ready.length) return { failure: failure('INVENTORY_FULL', 'applicable recipes have insufficient backpack capacity') }
  return { failure: { ...failure('RECIPE_QUERY_REQUIRED', 'no applicable recipe is currently executable from the backpack and requested workstation mode'),
    ...(recipeIndex === undefined ? { availableRecipes: [], availabilitySource: 'current-backpack-workstation-and-capacity', quantitiesPerExecution: true } : {}) } }
}

module.exports = { missingMaterials, diagnoseCraft }
