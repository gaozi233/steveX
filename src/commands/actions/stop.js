/**
 * stop — stop pathfinding
 */
module.exports = {
  name: 'stop',
  description: 'Immediate global safety stop through Agent: cancel active/queued actions, stop Brain/pathfinding/follow and release movement, sneak and held-item use. Unlike queued move stop or dig stop',
  usage: 'stop',
  async handler(bot) {
    if (bot._followInterval) {
      clearInterval(bot._followInterval)
      bot._followInterval = null
    }
    bot.pathfinder.stop()
    return { ok: true, output: 'Pathfinding and follow stopped' }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
