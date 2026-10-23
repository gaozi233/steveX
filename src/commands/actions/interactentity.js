const { withContract } = require('../command_contract')
module.exports = {
  name:'interactentity',
  description:'Assist right-click on a named entity or exact id within 4.5 blocks and unobstructed. normal default; at sends hit-position interaction; hand default or off-hand. No pathfinding/retries. Main-hand normal container/trading interaction uses native window initialization; off-hand native opening unsupported',
  usage:'interactentity <entityName|id> [normal|at] [hand|off-hand]',
  handler:withContract('interactentity',async(bot,args,agent,options)=>{
    const token=args[0].toLowerCase(),mode=args[1]||'normal',hand=args[2]||'hand',eye=bot.entity.position.offset(0,bot.entity.eyeHeight||1.62,0)
    const name=e=>(e.username||e.name||'').toLowerCase()
    const candidates=Object.values(bot.entities).filter(e=>e.id!==bot.entity.id && e.position && (/^\d+$/.test(token)?String(e.id)===token:name(e).includes(token)))
    if(!candidates.length)return {ok:false,errorCode:'ENTITY_NOT_FOUND',error:'No loaded matching entity'}
    candidates.sort((a,b)=>(name(b)===token)-(name(a)===token)||eye.distanceTo(a.position)-eye.distanceTo(b.position)||a.id-b.id)
    const entity=candidates[0],point=entity.position.offset(0,Math.min((entity.height||1)/2,1),0),distance=eye.distanceTo(point)
    if(distance>4.5)return {ok:false,errorCode:'ENTITY_OUT_OF_REACH',error:'Matching entity is beyond 4.5-block interaction reach; move closer'}
    if(!bot.world?.raycast)return {ok:false,errorCode:'INTERACTION_UNAVAILABLE',error:'Cannot check entity line of sight'}
    if(distance>0.05 && bot.world.raycast(eye,point.minus(eye).scaled(1/distance),distance-0.05))return {ok:false,errorCode:'ENTITY_OBSTRUCTED',error:'A block obstructs the entity interaction'}
    await bot.lookAt(point,true)
    options?.signal?.throwIfAborted()
    if(bot.entities[entity.id]!==entity || eye.distanceTo(entity.position.offset(0,Math.min((entity.height||1)/2,1),0))>4.5)return {ok:false,errorCode:'TARGET_CHANGED',error:'Entity moved away or disappeared; inspect before retrying'}
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
