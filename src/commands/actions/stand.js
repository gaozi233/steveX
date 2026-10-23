/**
 * stand — stop all movement controls
 */
module.exports = {
  name: 'stand',
  description: 'Queued stop of movement/pathfinding; preserves persistent sneak and held-item use. Does not immediately cancel active/queued actions; use stop for a global safety stop',
  usage: 'stand',
  async handler(bot) {
    bot.clearControlStates()
    return { ok: true, output: 'Movement stopped; persistent sneak hold is unchanged' }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
