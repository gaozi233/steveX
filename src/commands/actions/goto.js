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
  description: 'Pathfind to a block goal; x/y/z accept absolute decimals or ~ offsets from feet position at execution, then floor to block coordinates. No ^ local coordinates. Uses configured pathfinder movement policy; not protected dig/collect approach. Completion checks actual arrival',
  args,
  async handler(_b, args, agent) {
    if (args.length < 3) return { ok: false, error: 'Usage: goto <x> <y> <z>' }
    const bot=agent?.bot||_b,base=bot.entity?.position
    const values=args.map((token,i)=>require('../look_input').resolve(token,base?.[['x','y','z'][i]]))
    if(!values.every(v=>Number.isFinite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER))return {ok:false,errorCode:'STATE_UNAVAILABLE',error:'Resolved target unavailable or exceeds safe coordinate range'}
    const [x,y,z]=values
    if (!agent?.movements) return { ok: false, errorCode: 'PATHFINDER_NOT_READY', error: 'Pathfinder not ready' }
    const goal = new pathfinderGoals.GoalBlock(x, y, z)
    await bot.pathfinder.goto(goal)
    const position = bot.entity.position
    const actual = { x: position.x, y: position.y, z: position.z }
    // Upstream goto can resolve on an empty path without reaching its goal.
    if (!goal.isEnd({ x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) })) {
      bot.pathfinder.setGoal(null)
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
