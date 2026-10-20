/**
 * enchant — open the enchantment table in sight
 */
module.exports = {
  name: 'enchant',
  description: 'Open the enchantment table in sight',
  usage: 'enchant',
  async handler(bot) {
    const block = bot.blockAtCursor(4.5)
    if (!block) return { ok: false, error: 'No block in sight' }
    if (block.name !== 'enchanting_table') {
      return { ok: false, error: `Block in sight is ${block.name}, not an enchanting table` }
    }
    const table = await bot.openEnchantmentTable(block)
    bot._enchantTable = table
    return { ok: true, output: 'Opened enchantment table' }
  }
}
