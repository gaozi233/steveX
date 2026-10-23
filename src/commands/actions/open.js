/**
 * open — open the container block or entity in sight
 */
module.exports = {
  name: 'open',
  description: 'Open the aimed block container within 4.5 blocks; does not open entities. Use openentity for initialized villager trades or entity inventories',
  usage: 'open',
  async handler(bot) {
    const block = bot.blockAtCursor(4.5)
    if (!block) return { ok: false, error: 'No block in sight to open' }

    const container = await bot.openContainer(block)
    return { ok: true, output: `Opened ${block.name}` }
  }
}
