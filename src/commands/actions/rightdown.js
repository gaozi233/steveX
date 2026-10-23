const { withContract } = require('../command_contract')
const { hasUse, startUse, usedItem } = require('../held_use')
module.exports = {
  name: 'rightdown',
  description: 'Begin holding right mouse button for held hand (default) or off-hand item, not aimed block/entity interaction. Motion preserves hold. Crossbow: rightdown to load, observe charged_projectiles, rightdown again to fire. rightup ends hold. Request only, not confirmed effects',
  usage: 'rightdown [hand|off-hand]',
  handler: withContract('rightdown',async(bot,args)=>{
    if(bot.currentWindow)return {ok:false,errorCode:'WINDOW_OPEN',error:'Close the window before using a held item'}
    const hand=args[0] || 'hand', held=usedItem(bot,hand)
    if (!held) return { ok: false, errorCode:'NO_HELD_ITEM',hand,error: `No item in ${hand} to use` }
    if(hasUse(bot))return {ok:false,errorCode:'ITEM_ALREADY_IN_USE',error:'A use request is already active; rightup it before activating again'}
    const item=held.name
    startUse(bot,hand)
    return {ok:true,requested:true,confirmation:'request-sent-only',hand,item,output:`Use request sent for ${item} in ${hand}; eating, blocking, charging and other effects are not yet confirmed`}
  })
}
