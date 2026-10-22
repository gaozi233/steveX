/**
 * stop — stop pathfinding
 */
module.exports = {
  name: 'stop',
  description: 'Stop pathfinding',
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
