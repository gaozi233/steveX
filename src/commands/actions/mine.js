/**
 * mine <x> <y> <z> — walk to and dig a block at coordinates
 */
const Vec3 = require('vec3').Vec3
const { goals: pathfinderGoals } = require('mineflayer-pathfinder')
const skillRegistry = require("../../runtime/skill_registry.ts");

const args = {
  x: { required: true },
  y: { required: true },
  z: { required: true }
}

const skill = {
  name: 'mine',
  description: 'Walk to and dig a block at coordinates',
  args,
  async handler(_b, args, agent) {
    if (args.length < 3) return { ok: false, error: 'Usage: mine <x> <y> <z>' }
    const [x, y, z] = args.map(Number)
    if (isNaN(x) || isNaN(y) || isNaN(z)) return { ok: false, error: 'Invalid coordinates' }
    if (!agent.movements) return { ok: false, error: 'Pathfinder not ready' }

    const pos = new Vec3(x, y, z)
    const block = agent.bot.blockAt(pos)
    if (!block) return { ok: false, error: 'Block not loaded' }

    await agent.bot.pathfinder.goto(new pathfinderGoals.GoalBlock(x, y + 1, z))
    await agent.bot.dig(block)
    return { ok: true, output: `Mined ${block.name} at ${x} ${y} ${z}` }
  }
}

skillRegistry.register(skill);

module.exports = {
  name: skill.name,
  description: skill.description,
  usage: 'mine <x> <y> <z>',
  handler: skill.handler
}
