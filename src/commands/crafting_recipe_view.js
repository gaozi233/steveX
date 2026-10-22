function ingredients(bot, recipe) {
  const inputs = recipe.inShape ? recipe.inShape.flat() : recipe.ingredients || recipe.delta.filter(d => d.count < 0).map(d => ({ ...d, count: -d.count }))
  const totals = new Map()
  for (const input of inputs) {
    if (input.id < 0) continue
    const key = `${input.id}:${input.metadata ?? '*'}`
    const material = totals.get(key) || { item: bot.registry.items[input.id]?.name || `item_id_${input.id}`, count: 0,
      ...(input.metadata == null ? {} : { metadata: input.metadata }) }
    material.count += Math.abs(input.count || 1)
    totals.set(key, material)
  }
  return [...totals.values()]
}

function recipeView(bot, item, recipe, index) {
  return { index, outputCount: recipe.result.count,
    requiresWorkbench: !!recipe.requiresTable, ingredients: ingredients(bot, recipe),
    returns: recipe.delta.some(d => d.count > 0 && d.id !== item.id) ? recipe.delta.filter(d => d.count > 0 && d.id !== item.id).map(d => ({ item: bot.registry.items[d.id]?.name || `item_id_${d.id}`, count: d.count, ...(d.metadata == null ? {} : { metadata: d.metadata }) })) : null,
    supportedByCraft: recipe.delta.filter(d => d.id === item.id).reduce((n, d) => n + d.count, 0) === recipe.result.count }
}

module.exports = { recipeView }
