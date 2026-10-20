const skillRegistry = require("../../runtime/skill_registry.ts");

const args = {}

const skill = {
  name: 'attack',
  description: 'Attack the nearest entity',
  args,
  async handler(bot, _args) {
    const entity = bot.nearestEntity()
    if (!entity) return { ok: false, error: 'No entity nearby' }
    await bot.attack(entity)
    return { ok: true, output: `Attacked ${entity.name || entity.type}` }
  }
}

skillRegistry.register(skill);

/**
 * attack — attack the entity in front
 */
module.exports = {
  name: skill.name,
  description: skill.description,
  usage: 'attack',
  handler: skill.handler
}
