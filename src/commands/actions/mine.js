/**
 * mine <x> <y> <z> — walk to and dig a block at coordinates
 */
const Vec3 = require('vec3').Vec3
const { goals: pathfinderGoals } = require('mineflayer-pathfinder')
const skillRegistry = require("../../runtime/skill_registry.ts");
const { operation, digConfirmed } = require('../operation_result')
const { protectedApproach } = require('../protected_approach')

const args = {
  x: { required: true },
  y: { required: true },
  z: { required: true }
}

const skill = {
  name: 'mine',
  description: 'Approach and dig a solid block at integer coordinates; rechecks target; does not guarantee drop pickup',
  args,
  handler: operation('mine', async (_b, args, agent, { signal } = {}) => {
    if (args.length !== 3) return { ok: false, error: 'Usage: mine <x> <y> <z>' }
    const [x, y, z] = args.map(Number)
    if (![x, y, z].every(Number.isSafeInteger)) return { ok: false, error: 'Expected three safe integer block coordinates' }
    if (!agent.movements) return { ok: false, error: 'Pathfinder not ready' }

    const pos = new Vec3(x, y, z)
    const block = agent.bot.blockAt(pos)
    if (!block) return { ok: false, error: 'Block not loaded' }
    if (!block.diggable || block.boundingBox === 'empty') return { ok: false, error: 'Target is not a diggable solid block' }

    await protectedApproach(agent.bot, agent.movements, new pathfinderGoals.GoalGetToBlock(x, y, z), signal)
    signal?.throwIfAborted()
    const current = agent.bot.blockAt(pos)
    if (!current || current.stateId !== block.stateId) return { ok: false, error: 'Target block changed while approaching; query again before retrying' }
    if (!agent.bot.canDigBlock(current)) return { ok: false, error: 'Target is not diggable or out of reach after pathfinding' }
    return digConfirmed(agent.bot, current, signal)
  })
}

skillRegistry.register(skill);

module.exports = {
  name: skill.name,
  description: skill.description,
  usage: 'mine <x> <y> <z>',
  handler: skill.handler
}
