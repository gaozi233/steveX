/**
 * gamemode — show current game mode
 */
module.exports = {
  name: 'gamemode',
  description: 'Show current game mode',
  usage: 'gamemode',
  async handler(bot) {
    const modes = { 0: 'survival', 1: 'creative', 2: 'adventure', 3: 'spectator' }
    const gameMode = bot.game.gameMode
    const mode = typeof gameMode === 'string' ? gameMode.toLowerCase() : modes[gameMode] ?? '?'
    return { ok: true, output: `Game mode: ${mode}` }
  }
}
