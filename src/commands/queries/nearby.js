const skillRegistry = require("../../runtime/skill_registry.ts");
const { nearbyDetails } = require('../nearby_details')

const args = {
  type: {
    desc: 'Entity type or name filter (optional)',
    required: false
  },
  radius: { desc: 'Radius in blocks, 1..128 (default 32); use all for an unfiltered type', default: 32, required: false }
}

const skill = {
  name: 'nearby',
  description: 'List up to 20 loaded entities nearest first (radius default 32, 1..128); substring filter type/name or contained item name. Drops/frames include known item name/count; frames may include rotation, arrows/tridents inGround. Unknown details omitted; no line-of-sight filter',
  args,
  async handler(_b, args, agent) {
    const filter = args[0]?.toLowerCase()
    const filterType = filter && filter !== 'all' ? filter.replace(/^minecraft:/, '') : null
    const radius = args[1] === undefined ? 32 : (/^\d+$/.test(args[1]) ? Number(args[1]) : NaN)
    if (!Number.isInteger(radius) || radius < 1 || radius > 128) return { ok: false, error: 'Radius must be an integer in 1..128 blocks' }
    const origin = agent.bot.entity.position
    let ChatMessage
    const customName = entity => {
      const key = agent.bot.registry?.entitiesByName?.[entity.name]?.metadataKeys?.indexOf('custom_name') ?? -1
      const raw = key >= 0 ? entity.metadata?.[key] : null
      if (!raw) return null
      try {
        ChatMessage ||= require('prismarine-chat')(agent.bot.registry)
        return ChatMessage.fromNotch(raw).toString() || null
      } catch { return null }
    }
    const entities = Object.values(agent.bot.entities)
      .filter(e => e !== agent.bot.entity && (agent.bot.entity.id === undefined || e.id !== agent.bot.entity.id) && e.position)
      .map(e => ({ entity: e, customName: customName(e), distance: e.position.distanceTo(origin), details:nearbyDetails(agent.bot,e) }))
      .filter(({ entity: e, customName, details }) => !filterType || [e.type, e.name, e.username, customName, details.item?.name]
        .some(value => typeof value === 'string' && value.toLowerCase().includes(filterType)))
      .filter(e => e.distance <= radius)
      .sort((a, b) => a.distance - b.distance || (a.entity.id ?? 0) - (b.entity.id ?? 0))
      .slice(0, 20)

    if (entities.length === 0) return { ok: true, output: `No matching entities within ${radius} blocks`, radius, entities: [] }

    const list = entities.map(({ entity: e, customName, distance, details }) => {
      const pos = e.position
      const dist = Math.floor(distance)
      const extra = (details.item ? ` | Item: ${details.item.name} x${details.item.count}` : '') + (details.rotationDegrees !== undefined ? ` | Rotation: ${details.rotationDegrees}deg` : '') + (details.inGround !== undefined ? ` | In ground: ${details.inGround}` : '')
      return `${e.username || customName || e.name || e.type} (${e.type}) — ${dist}m [${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}]${extra}`
    }).join('\n')

    return { ok: true, output: `Nearby entities (within ${radius} blocks):\n${list}`, radius,
      entities: entities.map(({ entity: e, customName, distance, details }) => ({ id: e.id, name: e.username || customName || e.name || e.type, ...details,
        ...(customName ? { customName } : {}), ...(e.name ? { entityName: e.name } : {}), type: e.type, distance, position: e.position })) }
  }
}

skill.handler = require('../command_contract').withContract(skill.name, skill.handler)
skillRegistry.register(skill);

/**
 * nearby [type] — list nearby entities, optionally filtered by type
 */
module.exports = {
  name: skill.name,
  description: skill.description,
  usage: 'nearby [type|name|all] [radius]',
  handler: skill.handler,
}
