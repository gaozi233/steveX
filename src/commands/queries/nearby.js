const skillRegistry = require("../../runtime/skill_registry.ts");

const args = {
  type: {
    desc: 'Entity type or name filter (optional)',
    required: false
  }
}

const skill = {
  name: 'nearby',
  description: 'List nearby entities, optionally filtered by type',
  args,
  async handler(_b, args, agent) {
    const filterType = args.length > 0 ? args[0].toLowerCase() : null
    const entities = Object.values(agent.bot.entities)
      .filter(e => !filterType || e.type === filterType || (e.name && e.name.includes(filterType)))
      .filter(e => e !== agent.bot.entity)
      .slice(0, 20)

    if (entities.length === 0) return { ok: true, output: filterType ? `No "${filterType}" entities nearby` : 'No entities nearby' }

    const list = entities.map(e => {
      const pos = e.position
      const dist = Math.floor(pos.distanceTo(agent.bot.entity.position))
      return `${e.name || e.type} (${e.type}) — ${dist}m [${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}]`
    }).join('\n')

    return { ok: true, output: `Nearby entities:\n${list}` }
  }
}

skillRegistry.register(skill);

/**
 * nearby [type] — list nearby entities, optionally filtered by type
 */
module.exports = {
  name: skill.name,
  description: skill.description,
  usage: 'nearby [type]',
  handler: skill.handler,
}
