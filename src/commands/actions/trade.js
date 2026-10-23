/**
 * trade <index> [times] — trade with an opened villager
 */
module.exports = {
  name: 'trade',
  description: 'Execute a zero-based offer after right click initializes the villager window; times defaults to 1 (1..64). Read window trades first; never auto-opens or chooses offers',
  usage: 'trade <index> [times]',
  async handler(bot, args) {
    if (args.length < 1) return { ok: false, error: 'Usage: trade <index> [times]' }
    const { integer } = require('../workstations')
    let index, times
    try { index = integer(args[0], 'trade index'); times = integer(args[1] ?? 1, 'times', 1, 64) }
    catch (error) { return { ok: false, error: error.message } }
    // First, try to find an open villager window
    const villager = bot.currentWindow
    if (!villager) return { ok:false,errorCode:'WINDOW_REQUIRED',error:'Aim at a villager and use right click first' }
    if (!['minecraft:merchant','minecraft:villager'].includes(villager.type)) return {ok:false,errorCode:'WINDOW_TYPE_MISMATCH',error:'Current window is not a merchant'}
    if (!villager.trades) return {ok:false,errorCode:'WINDOW_NOT_READY',error:'Villager offers have not been initialized yet; inspect window after synchronization'}
    const offer = villager.trades[index]
    if (!offer || offer.tradeDisabled || offer.disabled) return { ok: false, error: 'Trade is missing or disabled' }
    if (Number.isFinite(offer.maximumNbTradeUses) && times > offer.maximumNbTradeUses - offer.nbTradeUses) return { ok: false, error: 'Requested times exceed remaining trade uses' }
    await bot.trade(villager, index, times)
    return { ok: true, output: `Traded ${times} time(s) with trade index ${index}` }
  }
}
