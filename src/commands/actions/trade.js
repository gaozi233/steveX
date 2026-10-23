/**
 * trade <index> [times] — trade with an opened villager
 */
module.exports = {
  name: 'trade',
  description: 'Execute a zero-based offer after right click initializes the villager window; times defaults to 1 (1..64). Read window trades first; never auto-opens or chooses offers',
  usage: 'trade <index> [times]',
  handler: require('../workstation_feedback').workstationAction('trade',async(bot,args,signal)=>{
    signal?.throwIfAborted()
    if (args.length < 1 || args.length>2) return { ok: false,errorCode:'INVALID_ARGUMENTS', error: 'Usage: trade <index> [times]' }
    const { integer } = require('../workstations')
    let index, times
    try { index = integer(args[0], 'trade index'); times = integer(args[1] ?? 1, 'times', 1, 64) }
    catch (error) { return { ok: false,errorCode:'INVALID_ARGUMENTS', error: error.message } }
    // First, try to find an open villager window
    const villager = bot.currentWindow
    if (!villager) return { ok:false,errorCode:'WINDOW_REQUIRED',error:'Aim at a villager and use right click first' }
    if (!['minecraft:merchant','minecraft:villager'].includes(villager.type)) return {ok:false,errorCode:'WINDOW_TYPE_MISMATCH',error:'Current window is not a merchant'}
    if (!villager.trades) return {ok:false,errorCode:'WINDOW_NOT_READY',error:'Villager offers have not been initialized yet; inspect window after synchronization'}
    const offer = villager.trades[index]
    if (!offer || offer.tradeDisabled || offer.disabled) return { ok: false,errorCode:'TRADE_UNAVAILABLE', error: 'Trade is missing or disabled' }
    if (Number.isFinite(offer.maximumNbTradeUses) && times > offer.maximumNbTradeUses - offer.nbTradeUses) return { ok: false,errorCode:'TRADE_LIMIT', error: 'Requested times exceed remaining trade uses' }
    const {sameItem}=require('../inventory_actions'),output=structuredClone(offer.outputItem)
    const count=()=>villager.slots.slice(villager.inventoryStart,villager.inventoryEnd).filter(i=>sameItem(i,output)).reduce((n,i)=>n+i.count,0)
    const before=count()
    await bot.trade(villager, index, times)
    return {ok:true,tradeIndex:index,requestedExecutions:times,verify:()=>!!output&&!villager.selectedItem&&count()-before===output.count*times}
  })
}
