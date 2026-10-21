/**
 * trade <index> [times] — trade with an opened villager
 */
module.exports = {
  name: 'trade',
  description: 'Trade with an opened villager',
  usage: 'trade <index> [times]',
  async handler(bot, args) {
    if (args.length < 1) return { ok: false, error: 'Usage: trade <index> [times]' }
    const { integer } = require('../workstations')
    let index, times
    try { index = integer(args[0], 'trade index'); times = integer(args[1] ?? 1, 'times', 1, 64) }
    catch (error) { return { ok: false, error: error.message } }
    // First, try to find an open villager window
    const villager = bot.currentWindow
    if (!villager || !villager.trades) return { ok: false, error: 'No initialized villager window open. Use "openentity" on a villager first.' }
    const offer = villager.trades[index]
    if (!offer || offer.tradeDisabled || offer.disabled) return { ok: false, error: 'Trade is missing or disabled' }
    if (Number.isFinite(offer.maximumNbTradeUses) && times > offer.maximumNbTradeUses - offer.nbTradeUses) return { ok: false, error: 'Requested times exceed remaining trade uses' }
    await bot.trade(villager, index, times)
    return { ok: true, output: `Traded ${times} time(s) with trade index ${index}` }
  }
}
