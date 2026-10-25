/**
 * follow <playerName> — follow a player continuously
 */
const { goals: pathfinderGoals } = require('mineflayer-pathfinder')

module.exports = {
  name: 'follow',
  description: 'Follow a player continuously',
  usage: 'follow <playerName>',
  async handler(bot, args, agent) {
    if (args.length < 1) return { ok: false, error: 'Usage: follow <playerName>' }
    const targetName = args.join(' ').toLowerCase()
    const target = Object.values(bot.players).find(p => p.username.toLowerCase() === targetName)
    if (!target || !target.entity) return { ok: false, errorCode: 'PLAYER_NOT_TRACKED', error: `Player "${targetName}" not found or too far` }

    bot._followCleanup?.()
    const entity = target.entity
    const gone = removed => {
      if (removed !== entity || bot._followCleanup!==cleanup) return
      cleanup()
      bot.pathfinder.setGoal(null)
      if(agent?.bot===bot && agent.currentAction==='follow'){
        agent.currentAction=agent.connected?'Idle':'Offline'
        agent.backgroundSource=null
        agent.eventBus?.emit('agent:update',{name:agent.name,sessionId:agent.sessionId,timestamp:Date.now()})
      }
    }
    const cleanup = () => {
      bot.removeListener('entityGone', gone)
      if (bot._followCleanup === cleanup) bot._followCleanup = null
    }
    bot._followCleanup = cleanup
    bot.on('entityGone', gone)
    try{bot.pathfinder.setGoal(new pathfinderGoals.GoalFollow(entity, 2), true)}
    catch(error){cleanup();throw error}
    return { ok: true, status: 'RUNNING', output: `Now following ${target.username}; next action replaces follow` }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
