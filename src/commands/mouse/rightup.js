const { withContract } = require('../command_contract')
const { releaseUse, useState } = require('../held_use')
module.exports = {
  name: 'rightup',
  description: 'Release the right mouse button: cancels unfinished drinking/loading and may fire a drawn bow, but does not fire a loaded crossbow. Request only, not confirmed world effects',
  usage: 'rightup',
  handler: withContract('rightup',async(bot)=>{
    const state = useState(bot)
    if(!releaseUse(bot))return {ok:true,requested:false,hadActiveUse:false,released:false,hand:null,confirmed:false,output:'No active client use request; released=false, hand=unknown'}
    return {ok:true,requested:true,hadActiveUse:state.active,released:true,hand:state.hand,confirmed:false,confirmation:'request-sent-only',output:`Released active client use in ${state.hand || 'unknown hand'}; server effects unconfirmed`}
  })
}
