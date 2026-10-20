const { mcDataManager } = require("../../utils/mc_data.ts");
const skillRegistry = require("../../runtime/skill_registry.ts");

const args = {
  itemName: { desc: 'Name of the item to craft (e.g. "oak_planks")', required: true },
  count: { desc: 'Number of items to craft (default: 1)', required: false, default: 1 }
};

const skill = {
  name: 'craft',
  description: 'Craft an item from inventory (hand-craftable only)',
  args,
  async handler(_b, args, agent) {
    if (args.length < 1) return { ok: false, error: 'Usage: craft <itemName> [count]' }
    const itemName = args[0].toLowerCase()
    const count = args[1] ? parseInt(args[1], 10) : 1
    if (isNaN(count) || count < 1) return { ok: false, error: 'Invalid count' }

    const mcData = mcDataManager.get(agent.bot.version)
    const itemId = Object.values(mcData.items).find(i => i.name === itemName || i.displayName?.toLowerCase() === itemName)?.id
    if (!itemId) return { ok: false, error: `Unknown item: "${itemName}"` }

    const recipes = agent.bot.recipesFor(itemId, null, count, null)
    if (recipes.length === 0) return { ok: false, error: `No hand-craftable recipe for "${itemName}"` }

    await agent.bot.craft(recipes[0], count, null)
    return { ok: true, output: `Crafted ${itemName} x${count}` }
  }
}

skillRegistry.register(skill);

/**
 * craft <itemName> [count] — craft an item from inventory
 */
module.exports = {
  name: skill.name,
  description: skill.description,
  usage: 'craft <itemName> [count]',
  handler: skill.handler
}
