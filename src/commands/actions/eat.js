const skillRegistry = require("../../runtime/skill_registry.ts");

const args = {}

const skill = {
  name: 'eat',
  description: 'Eat the currently held food item',
  args,
  async handler(bot, _args) {
    if (!bot.heldItem) return { ok: false, error: 'No item in hand' }
    const itemName = bot.heldItem.name
    await bot.consume()
    return { ok: true, output: `Ate ${itemName}` }
  }
}

skillRegistry.register(skill);

/**
 * eat — eat the held food
 */
module.exports = {
  name: skill.name,
  description: skill.description,
  usage: 'eat',
  handler: skill.handler
}
