/**
 * fish — cast and reel fishing rod
 */
module.exports = {
  name: 'fish',
  description: 'Automated fishing skill with main-hand rod: one cast, upstream bite detection, one reel request. Own-bobber ownership checked; bounded timeout/cancellation cleanup, never blind recast. Catch/inventory gain not confirmed; inspect feedback before retry. Not a single right-click',
  usage: 'fish',
  handler:require('../command_contract').withContract('fish',(bot,args,agent,options)=>require('../fishing_session').fishSession(bot,options))
}
