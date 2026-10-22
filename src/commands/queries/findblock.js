const skillRegistry = require("../../runtime/skill_registry.ts");

const args = {
  blockName: {
    desc: 'Name of the block to find (e.g. "diamond_ore")',
    required: true
  },
  radius: {
    desc: 'Integer radius 1..128 from the player block position (default: 32)',
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
    const targetName = args[0].toLowerCase().replace(/^minecraft:/, '')
    const maxDistance = args[1] === undefined ? 32 : /^\d+$/.test(args[1]) ? Number(args[1]) : NaN
    if (!Number.isInteger(maxDistance) || maxDistance < 1 || maxDistance > 128) return { ok: false, error: 'Radius must be an integer in 1..128 blocks' }

    const mcData = require('minecraft-data')(agent.bot.version)
    const blockId = Object.values(mcData.blocks).find(b => b.name === targetName || b.displayName?.toLowerCase() === targetName)?.id
    if (blockId === undefined) return { ok: false, errorCode: 'UNKNOWN_BLOCK', error: `Unknown block: "${targetName}"` }

    const origin = agent.bot.entity.position.floored()

    const found = agent.bot.findBlock({
      matching: blockId,
      point: origin,
      maxDistance,
      count: 1
    })

    if (!found) return { ok: true, output: `No "${targetName}" found within ${maxDistance}m`, found: false, radius: maxDistance }

    const pos = found.position
    const distance = pos.distanceTo(origin)
    return { ok: true, output: `Found ${targetName} at ${pos.x} ${pos.y} ${pos.z} (block-grid distance: ${distance.toFixed(1)}m)`,
      found: true, block: found.name || targetName, position: { x: pos.x, y: pos.y, z: pos.z }, distance, radius: maxDistance }
  }
}

skill.handler = require('../command_contract').withContract(skill.name, skill.handler)
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
