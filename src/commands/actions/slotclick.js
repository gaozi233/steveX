const api=require('../window_actions')
module.exports={name:'slotclick',usage:'slotclick <inventory:slot|window:slot> [left|right|shift-left]',
  description:'Explicit scope: inventory indices stay fixed even with containers open; window only container/workstation slots. left default, right split/place one, shift-left quick move. Equipment/off-hand/crafting clicks require closing containers. Reports scoped changes/cursor, not task completion',
  handler:api.action('slotclick',async(bot,w,args,signal)=>{
    const {parseSlotRef,nativeSlot}=require('../slot_scope'),ref=parseSlotRef(args[0]),slot=nativeSlot(bot,ref.slotSpace,ref.slot),button=args[1]||'left'
    api.itemAt(w,slot);api.ensureCurrent(bot,w,signal)
    if(button==='shift-left')api.emptyCursor(w)
    await bot.clickWindow(slot,button==='right'?1:0,button==='shift-left'?1:0)
    return {...ref,button}
  })}
