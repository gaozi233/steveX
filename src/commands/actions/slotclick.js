const api=require('../window_actions')
module.exports={name:'slotclick',usage:'slotclick <slot> [left|right|shift-left]',
  description:'Click a current-window/player-inventory slot: left default, right splits/places one, shift-left asks native quick move. Not world right click; may craft/trade when clicking a result. Reports changed slots and cursor, not inferred task completion',
  handler:api.action('slotclick',async(bot,w,args,signal)=>{
    const slot=Number(args[0]),button=args[1]||'left'
    api.itemAt(w,slot);api.ensureCurrent(bot,w,signal)
    if(button==='shift-left')api.emptyCursor(w)
    await bot.clickWindow(slot,button==='right'?1:0,button==='shift-left'?1:0)
    return {slot,button}
  })}
