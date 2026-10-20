/**
 * furnace — open the furnace block in sight
 */
module.exports = {
  name: 'furnace',
  description: 'Open the furnace block in sight',
  usage: 'furnace',
  async handler(bot) {
    const block = bot.blockAtCursor(4.5)
    if (!block) return { ok: false, error: 'No block in sight' }
    if (!['furnace', 'blast_furnace', 'smoker'].includes(block.name)) {
      return { ok: false, error: `Block in sight is ${block.name}, not a furnace` }
    }
    const furnace = await bot.openFurnace(block)
    // Store reference for sub-commands like takeInput, putFuel etc.
    bot._furnace = furnace
    return { ok: true, output: `Opened furnace: ${block.name}` }
  }
}
