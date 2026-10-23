/**
 * dispenser — open the dispenser/dropper block in sight
 */
module.exports = {
  name: 'dispenser',
  description: 'Open only the aimed dispenser/dropper within 4.5 blocks; this does not trigger dispensing. Use window to inspect slots',
  usage: 'dispenser',
  async handler(bot) {
    const block = bot.blockAtCursor(4.5)
    if (!block) return { ok: false, error: 'No block in sight' }
    if (!['dispenser', 'dropper'].includes(block.name)) {
      return { ok: false, error: `Block in sight is ${block.name}, not a dispenser or dropper` }
    }
    const container = await bot.openDispenser(block)
    return { ok: true, output: `Opened ${block.name}` }
  }
}
