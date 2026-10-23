const api=require('../window_actions')
module.exports={name:'putaway',usage:'putaway <slot>',
  description:'Move source stack into player backpack; destination chosen automatically among empty/identical-component slots. Requires sufficient space, never drops overflow; rejects result slots to avoid repeated crafting/trading. Reports actual slot changes',
  handler:api.action('putaway',async(bot,w,args,signal)=>{
    const slot=Number(args[0]),[start,end]=api.inventoryRange(w)
    if(slot===w.craftingResultSlot || (w.type==='minecraft:merchant'&&slot===2))api.fail('RESULT_SLOT_REQUIRES_CLICK','Use slotclick for crafting/trading result; putaway does not choose/repeat recipes')
    return api.intoRange(bot,w,slot,start,end,undefined,signal)
  })}
