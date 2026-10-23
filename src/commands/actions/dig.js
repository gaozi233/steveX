/**
 * dig — dig the block in front
 */
const { operation, digConfirmed } = require('../operation_result')
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { protectedApproach } = require('../protected_approach')
const { exceptionFailure } = require('../command_contract')
module.exports = {
  name: 'dig',
  description: 'dig: break aimed block without moving. dig x y z: approach integer block coordinates without digging/building en route, then aim and break. dig stop: immediately cancel digging/approach, not unrelated motion. No auto tool selection or guaranteed pickup',
  usage: 'dig [stop|<x> <y> <z>]',
  handler: operation('dig', async (bot, args, agent, { signal } = {}) => {
    if(args[0]==='stop'){
      const task=agent?.executor?.active
      if(task?.name === 'dig')task.controller.abort(require('../../agent/action_executor').cancelled('Digging stopped'))
      bot.stopDigging()
      return {ok:true,confirmed:true,mode:'stop',phase:'stop',approachAttempted:false,approached:false,target:null,changes:[],evidence:['client-dig-stop'],output:'Digging stop requested; completed block changes are not undone'}
    }
    const feedback = { mode: args.length ? 'coordinates' : 'crosshair', phase: 'preflight', approachAttempted: false, approached: false, target: null }
    const fail = (errorCode, error) => ({ ok: false, errorCode, error, changes: [], ...feedback })
    try {
      signal?.throwIfAborted()
      let block
      if (args.length) {
        const pos = new Vec3(...args.map(Number))
        feedback.target = { position: { x: pos.x, y: pos.y, z: pos.z } }
        block = bot.blockAt(pos)
        if (!block) return fail('TARGET_NOT_LOADED', 'Block not loaded')
        feedback.target.block = block.name
        if (!block.diggable || block.boundingBox === 'empty') return fail('TARGET_NOT_DIGGABLE', 'Target is not a diggable solid block')
        if (!bot.canDigBlock(block)) {
          if (!agent?.movements || !bot.pathfinder) return fail('PATHFINDER_NOT_READY', 'Pathfinder not ready')
          feedback.phase = 'approach'; feedback.approachAttempted = true
          await protectedApproach(bot, agent.movements, new goals.GoalGetToBlock(pos.x, pos.y, pos.z), signal)
          feedback.approached = true
        }
        signal?.throwIfAborted()
        const current = bot.blockAt(pos)
        if (!current || current.stateId !== block.stateId) return fail('TARGET_CHANGED', 'Target changed while approaching; query again before retrying')
        block = current
        if (!bot.canDigBlock(block)) return fail('TARGET_NOT_DIGGABLE', 'Target is out of reach after approaching')
        feedback.phase = 'aim'
        await bot.lookAt(pos.offset(0.5, 0.5, 0.5), true)
        signal?.throwIfAborted()
        const hit = bot.blockAtCursor(4.5)
        if (!hit || !hit.position.equals(pos)) return fail('TARGET_OBSTRUCTED', 'Target is not the first block along the aiming ray')
        if (hit.stateId !== block.stateId) return fail('TARGET_CHANGED', 'Target changed while aiming')
      } else {
        block = bot.blockAtCursor(4.5)
        if (!block) return fail('NO_TARGET', 'No block in sight')
        feedback.target = { block: block.name, position: { x: block.position.x, y: block.position.y, z: block.position.z } }
        if (!bot.canDigBlock(block)) return fail('TARGET_NOT_DIGGABLE', 'Block is not diggable or out of reach')
      }
      feedback.phase = 'dig'
      return { ...feedback, ...await digConfirmed(bot, block, signal) }
    } catch (error) {
      return { ...feedback, ...exceptionFailure('dig', error, signal), changes: feedback.phase === 'dig' ? null : [], output: 'Dig incomplete; inspect target and inventory before retrying' }
    }
  })
}
