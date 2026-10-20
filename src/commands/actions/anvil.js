/**
 * anvil — open the anvil block in sight
 */
module.exports = {
  name: 'anvil',
  description: 'Open the anvil block in sight',
  usage: 'anvil',
  async handler(bot) {
    const block = bot.blockAtCursor(4.5)
    if (!block) return { ok: false, error: 'No block in sight' }
    if (!['anvil', 'chipped_anvil', 'damaged_anvil'].includes(block.name)) {
      return { ok: false, error: `Block in sight is ${block.name}, not an anvil` }
    }
    const anvil = await bot.openAnvil(block)
    bot._anvil = anvil
    return { ok: true, output: 'Opened anvil' }
  }
}
