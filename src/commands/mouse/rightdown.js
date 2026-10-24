const { withContract } = require('../command_contract')
const { hasUse, startUse, usedItem, useState, heldUseKind } = require('../held_use')
module.exports = {
  name: 'rightdown',
  description: 'Use only the explicitly selected hand (default main hand); never fallback to off-hand. Known unusable tools fail without packets or a hold lock. Supported sustained items track a client request, not confirmed server use; instant/unknown requests retain no hold lock. Motion preserves a tracked hold; right up releases it. Not aimed block/entity interaction',
  usage: 'rightdown [hand|off-hand]',
  handler: withContract('rightdown',async(bot,args)=>{
    if(bot.currentWindow || require('../book_ui').bookContext(bot))return {ok:false,errorCode:'WINDOW_OPEN',error:'Close the interface before using a held item'}
    const hand=args[0] || 'hand', held=usedItem(bot,hand)
    if (!held) return { ok: false, errorCode:'NO_HELD_ITEM',hand,error: `No item in ${hand} to use` }
    const item=held.name
    if(hasUse(bot)) {
      const state=useState(bot)
      return {ok:false,errorCode:'ITEM_ALREADY_IN_USE',hand,item,activeUse:{hand:state.hand,item:state.item,confirmed:false},
        error:`A client use request is active for ${state.item || 'unknown item'} in ${state.hand || 'unknown hand'}; requested ${item} in ${hand} was not activated. Send right up first. Server use is not confirmed`}
    }
    if(heldUseKind(bot,held)==='unsupported')return {ok:false,errorCode:'ITEM_NOT_USABLE',requested:false,hand,item,holdTracked:false,
      error:`${item} in ${hand} has no supported held-item use; no packet sent and no use state acquired. Aimed block/entity interactions use right click. No other hand was activated`}
    const state=startUse(bot,hand)
    return {ok:true,requested:true,confirmation:'request-sent-only',hand,item,...state,
      output:state.holdTracked?`Use request sent for ${item} in ${hand}; tracked as a client hold request only, not confirmed server use. right up releases this request`:
        `Single use request sent for ${item} in ${hand}; no sustained-use state retained. Server effect unconfirmed; no other hand was activated`}
  })
}
