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
    if (![x, y, z].every(Number.isFinite)) return { ok: false, error: 'Invalid coordinates: expected finite numbers' }
    if (!agent.movements) return { ok: false, errorCode: 'PATHFINDER_NOT_READY', error: 'Pathfinder not ready' }
    const goal = new pathfinderGoals.GoalBlock(x, y, z)
    await agent.bot.pathfinder.goto(goal)
    const position = agent.bot.entity.position
    const actual = { x: position.x, y: position.y, z: position.z }
    // Upstream goto can resolve on an empty path without reaching its goal.
    if (!goal.isEnd({ x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) })) {
      agent.bot.pathfinder.setGoal(null)
      return { ok: false, errorCode: 'PATH_NOT_REACHED', error: 'Pathfinder finished without reaching the target block', position: actual,
        target: { x: goal.x, y: goal.y, z: goal.z } }
    }
    return { ok: true, output: `Arrived at ${goal.x} ${goal.y} ${goal.z}`, position: actual,
      target: { x: goal.x, y: goal.y, z: goal.z } }
  }
}

module.exports = {
  name: skill.name,
  description: skill.description,
  usage: 'goto <x> <y> <z>',
  handler: skill.handler
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
