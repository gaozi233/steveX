const skillRegistry = require("../../runtime/skill_registry.ts");

const args = {};

const skill = {
  name: 'inventory',
  description: 'List inventory contents',
  args,
  async handler(_b, _a, agent) {
    const items = require('../../agent/interaction_memory').inventoryItems(agent.bot)
    if (items.length === 0) return { ok: true, output: 'Inventory is empty' }
    const list = items.map(i => `${i.name} x${i.count}`).join(', ')
    return { ok: true, output: `Inventory: ${list}` }
  }
}

skillRegistry.register(skill);

/**
 * inventory — list inventory
 */
module.exports = {
  name: skill.name,
  description: skill.description,
  usage: 'inventory',
  handler: skill.handler
}
