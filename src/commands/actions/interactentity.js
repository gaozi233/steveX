const { withContract } = require('../command_contract')
module.exports = {
  name:'interactentity',
  description:'Assist main-hand right-click on nearest loaded matching entity name or exact numeric id, within 4.5 blocks and unobstructed. normal default; at sends hit-position interaction. No pathfinding or retries; request only, not confirmed effect',
  usage:'interactentity <entityName|id> [normal|at]',
  handler:withContract('interactentity',async(bot,args)=>{
    const token=args[0].toLowerCase(),mode=args[1]||'normal',eye=bot.entity.position.offset(0,bot.entity.height||1.62,0)
    const name=e=>(e.username||e.name||'').toLowerCase()
    const candidates=Object.values(bot.entities).filter(e=>e.id!==bot.entity.id && e.position && (/^\d+$/.test(token)?String(e.id)===token:name(e).includes(token)))
    if(!candidates.length)return {ok:false,errorCode:'ENTITY_NOT_FOUND',error:'No loaded matching entity'}
    candidates.sort((a,b)=>(name(b)===token)-(name(a)===token)||eye.distanceTo(a.position)-eye.distanceTo(b.position)||a.id-b.id)
    const entity=candidates[0],point=entity.position.offset(0,Math.min((entity.height||1)/2,1),0),distance=eye.distanceTo(point)
    if(distance>4.5)return {ok:false,errorCode:'ENTITY_OUT_OF_REACH',error:'Matching entity is beyond 4.5-block interaction reach; move closer'}
    if(!bot.world?.raycast)return {ok:false,errorCode:'INTERACTION_UNAVAILABLE',error:'Cannot check entity line of sight'}
    if(distance>0.05 && bot.world.raycast(eye,point.minus(eye).scaled(1/distance),distance-0.05))return {ok:false,errorCode:'ENTITY_OBSTRUCTED',error:'A block obstructs the entity interaction'}
    await bot.lookAt(point,true)
    if(bot.entities[entity.id]!==entity || eye.distanceTo(entity.position.offset(0,Math.min((entity.height||1)/2,1),0))>4.5)return {ok:false,errorCode:'TARGET_CHANGED',error:'Entity moved away or disappeared; inspect before retrying'}
    if(mode==='at')await bot.activateEntityAt(entity,entity.position.offset(0,Math.min((entity.height||1)/2,1),0))
    else await bot.activateEntity(entity)
    return {ok:true,requested:true,confirmation:'request-sent-only',target:{id:entity.id,name:entity.username||entity.name},mode,output:`Main-hand entity right-click request sent to ${entity.username||entity.name} (${entity.id}); effect not confirmed`}
  })
}
