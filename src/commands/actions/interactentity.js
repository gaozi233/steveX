const { withContract } = require('../command_contract')
const { selectEntity, aimPoint, checkReach } = require('../entity_target')
module.exports = {
  name:'interactentity',
  description:'Assist right-click on a named entity or exact id within 4.5 blocks and unobstructed. normal default; at sends hit-position interaction; hand default or off-hand. No pathfinding/retries. Main-hand normal container/trading interaction uses native window initialization; off-hand native opening unsupported',
  usage:'interactentity <entityName|id> [normal|at] [hand|off-hand]',
  handler:withContract('interactentity',async(bot,args,agent,options)=>{
    const mode=args[1]||'normal',hand=args[2]||'hand'
    const entity=selectEntity(bot,args[0],{fromEyes:true})
    if(!entity)return {ok:false,errorCode:'ENTITY_NOT_FOUND',error:'No loaded matching entity'}
    let invalid=checkReach(bot,entity,4.5)
    if(invalid)return invalid
    await bot.lookAt(aimPoint(entity),true)
    options?.signal?.throwIfAborted()
    invalid=checkReach(bot,entity,4.5)
    if(invalid)return invalid
    const sneaking=!!bot.getControlState?.('sneak'),windows=require('../window_open')
    if(mode==='normal'&&!sneaking&&windows.entityWindowMethod(entity)) {
      if(hand==='off-hand')return {ok:false,errorCode:'HAND_NOT_SUPPORTED',error:'Native entity window opening requires hand'}
      return windows.openWindow(bot,entity,{entity:true,signal:options?.signal})
    }
    if(hand==='off-hand'||sneaking){
      const local=entity.position.offset(0,Math.min((entity.height||1)/2,1),0).minus(entity.position)
      bot._client.write('use_entity',{target:entity.id,mouse:mode==='at'?2:0,hand:hand==='off-hand'?1:0,sneaking,x:local.x,y:local.y,z:local.z})
    }
    else if(mode==='at')await bot.activateEntityAt(entity,entity.position.offset(0,Math.min((entity.height||1)/2,1),0))
    else await bot.activateEntity(entity)
    return {ok:true,status:'requested',confirmed:false,evidence:[],target:{id:entity.id,name:entity.username||entity.name},mode,hand,output:`${hand} entity right-click request sent to ${entity.username||entity.name} (${entity.id}); effect not confirmed`}
  })
}
