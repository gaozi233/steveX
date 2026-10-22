const skillRegistry = require("../../runtime/skill_registry.ts");

const args = {};

const skill = {
  name: 'inventory',
  description: 'List inventory contents',
  args,
  async handler(_b, _a, agent) {
    const { inventoryItems, compactItemView, inventoryCapacity, equipmentView } = require('../../agent/interaction_memory')
    const items = inventoryItems(agent.bot)
    const data = { inventory: items.map(compactItemView),
      inventorySlotSpace: agent.bot.currentWindow ? 'current-window' : 'player-inventory', ...inventoryCapacity(agent.bot), ...equipmentView(agent.bot) }
    const equipment = Object.entries(data.equipment || {}).map(([slot, item]) => `${slot}=${item.name} x${item.count}`).join(', ')
    const extra = (data.emptySlotCount === undefined ? '' : ` | Empty slots: ${data.emptySlotCount}`) + (equipment ? ` | Equipment: ${equipment}` : '')
    if (items.length === 0) return { ok: true, output: `Inventory is empty${extra}`, ...data }
    const list = items.map(i => `${i.name} x${i.count}`).join(', ')
    return { ok: true, output: `Inventory: ${list}${extra}`, ...data }
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
