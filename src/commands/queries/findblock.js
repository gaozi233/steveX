const skillRegistry = require("../../runtime/skill_registry.ts");

const args = {
  blockName: {
    desc: 'Name of the block to find (e.g. "diamond_ore")',
    required: true
  },
  radius: {
    desc: 'Search radius in blocks (default: 32)',
    default: 32,
    required: false
  }
}

const skill = {
  name: 'findblock',
  description: 'Find the nearest block by name',
  args,
  async handler(_b, args, agent) {
    if (args.length < 1) return { ok: false, error: 'Usage: findblock <blockName> [radius]' }
    const targetName = args[0].toLowerCase()
    const maxDistance = args[1] ? parseInt(args[1], 10) : 32
    if (isNaN(maxDistance) || maxDistance < 1) return { ok: false, error: 'Invalid radius' }

    const mcData = require('minecraft-data')(agent.bot.version)
    const blockId = Object.values(mcData.blocks).find(b => b.name === targetName || b.displayName?.toLowerCase() === targetName)?.id
    if (!blockId) return { ok: false, error: `Unknown block: "${targetName}"` }

    const found = agent.bot.findBlock({
      matching: blockId,
      maxDistance,
      count: 5
    })

    if (!found) return { ok: true, output: `No "${targetName}" found within ${maxDistance}m` }

    const pos = found.position
    return { ok: true, output: `Found ${targetName} at ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} (distance: ${Math.floor(pos.distanceTo(agent.bot.entity.position))}m)` }
  }
}

skillRegistry.register(skill);

/**
 * findblock <blockName> [radius] — find the nearest block by name
 */
module.exports = {
  name: skill.name,
  description: skill.description,
  usage: 'findblock <blockName> [radius]',
  handler: skill.handler
}
