const { withContract } = require('../command_contract')
const { releaseUse } = require('../held_use')
module.exports = {
  name: 'rightup',
  description: 'Release the right mouse button: cancels unfinished drinking/loading and may fire a drawn bow, but does not fire a loaded crossbow. Request only, not confirmed world effects',
  usage: 'rightup',
  handler: withContract('rightup',async(bot)=>{
    if(!releaseUse(bot))return {ok:true,requested:false,output:'No active client use request to release'}
    return {ok:true,requested:true,confirmation:'request-sent-only',output:'Release request sent; resulting world effect is not yet confirmed'}
  })
}
