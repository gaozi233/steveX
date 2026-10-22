/**
 * gamemode — show current game mode
 */
module.exports = {
  name: 'gamemode',
  description: 'Show current game mode',
  usage: 'gamemode',
  async handler(bot) {
    const modes = { 0: 'survival', 1: 'creative', 2: 'adventure', 3: 'spectator' }
    const gameMode = bot.game?.gameMode
    const value = typeof gameMode === 'string' ? gameMode.toLowerCase() : modes[gameMode]
    const mode = Object.values(modes).includes(value) ? value : null
    return { ok: true, output: `Game mode: ${mode ?? '?'}`, mode }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
