const handlers = { click: require('../mouse/rightclick').handler, down: require('../mouse/rightdown').handler, up: require('../mouse/rightup').handler }
module.exports = {
  name: 'right',
  usage: 'right <click|down> [hand|off-hand] | right up',
  description: 'click: one aimed interaction/place/short item use, no retries; main-hand container/workstation/villager opening uses native initialization, not automatic content operations. down: use selected hand (main hand default, no other-hand fallback), not repeated world clicking. Known unusable tools fail without sending; only supported sustained items retain a client hold request, not confirmed server use. Instant/unknown requests retain no hold lock. Conflicts identify the active hand/item. up: no hand argument; report hadActiveUse/released/actual hand (null if unknown). Local release is not server confirmation; may fire drawn bow, not loaded crossbow',
  handler: require('../command_contract').withContract('right', async (bot,args,agent,options) => {
    const operation = args[0]
    const result = await handlers[operation](bot,args.slice(1),agent,options)
    const {requested,confirmation,...feedback}=result
    return { ...feedback, action:'right', operation,confirmed:result.confirmed===true,
      status:result.status || (result.ok===false?'failed':result.confirmed===true?'completed':'requested'),evidence:result.evidence||[] }
  })
}
