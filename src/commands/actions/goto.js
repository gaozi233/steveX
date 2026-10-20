/**
 * goto <x> <y> <z> — pathfind to coordinates
 */
const { goals: pathfinderGoals } = require('mineflayer-pathfinder')
const skillRegistry = require("../../runtime/skill_registry.ts");

const args = {
  x: { required: true },
  y: { required: true },
  z: { required: true }
}

const skill = {
  name: 'goto',
  description: 'Pathfind to coordinates',
  args,
  async handler(_b, args, agent) {
    if (args.length < 3) return { ok: false, error: 'Usage: goto <x> <y> <z>' }
    const [x, y, z] = args.map(Number)
    if (isNaN(x) || isNaN(y) || isNaN(z)) return { ok: false, error: 'Invalid coordinates' }
    if (!agent.movements) return { ok: false, error: 'Pathfinder not ready' }
    await agent.bot.pathfinder.goto(new pathfinderGoals.GoalBlock(x, y, z))
    return { ok: true, output: `Arrived at ${x} ${y} ${z}` }
  }
}

module.exports = {
  name: skill.name,
  description: skill.description,
  usage: 'goto <x> <y> <z>',
  handler: skill.handler
}
