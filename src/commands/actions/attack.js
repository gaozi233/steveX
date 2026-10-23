const {withContract} = require('../command_contract')
const {selectEntity,aimPoint,checkReach} = require('../entity_target')
const {waitFor} = require('../operation_result')
module.exports = {
  name:'attack', usage:'attack <entityName|id>',
  description:'Aim and attack one named entity or exact id, within 3 blocks and unobstructed; no pathfinding/retries or friend filtering. hit=true only for server damage attributed to self; hit=null means unconfirmed, not a miss. Does not expose hidden target health',
  handler:withContract('attack',async(bot,args,agent,{signal}={})=>{
    const entity=selectEntity(bot,args[0])
    if(!entity)return {ok:false,errorCode:'ENTITY_NOT_FOUND',error:'No loaded matching entity',hit:false,confirmed:false}
    let invalid=checkReach(bot,entity,3)
    if(invalid)return {...invalid,hit:false,confirmed:false}
    await bot.lookAt(aimPoint(entity),true)
    signal?.throwIfAborted()
    invalid=checkReach(bot,entity,3)
    if(invalid)return {...invalid,hit:false,confirmed:false}
    if(!bot._client?.on)return {ok:false,errorCode:'CONFIRMATION_UNAVAILABLE',error:'Damage packet observation unavailable; no attack sent',hit:false,confirmed:false}
    let hit=false,sent=false
    const damaged=p=>{if(sent && p.entityId===entity.id && p.sourceCauseId===bot.entity.id+1)hit=true}
    bot._client.on('damage_event',damaged)
    const target={id:entity.id,name:entity.username||entity.name}
    try {
      sent=true
      await bot.attack(entity)
      await waitFor(()=>hit,signal,1000)
      return {ok:true,status:hit?'completed':'requested',confirmed:hit,hit:hit?true:null,target,
        evidence:hit?['server-damage-attributed-to-self']:[],
        output:hit?`Hit ${target.name} (${target.id}); server damage attributed to self`:
          `Attack sent to ${target.name} (${target.id}); hit unknown (no attributed damage within 1000ms), not a confirmed miss`}
    } catch(error) {
      return {ok:false,errorCode:signal?.aborted?'CANCELLED':'ATTACK_FAILED',error:error.message,confirmed:hit,hit:hit?true:null,target,
        evidence:hit?['server-damage-attributed-to-self']:[],output:`Attack interrupted; hit=${hit?'true':'unknown'}; inspect before retrying`}
    } finally {bot._client.removeListener('damage_event',damaged)}
  })
}
require('../../runtime/skill_registry.ts').register({...module.exports,args:{target:{required:true,desc:'Entity name fragment or exact numeric id'}}})
