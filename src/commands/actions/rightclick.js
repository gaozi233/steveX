const {withContract}=require('../command_contract')
const {usedItem,hasUse,startUse,releaseUse}=require('../held_use')
const {sleep}=require('../../agent/action_executor')
const {syncInventory,inventoryChanges,observeBlock,waitFor,position}=require('../operation_result')
const {placementCounts,opensWindow,interactive,airUse,blockClick,aimedEntity,aimedBlock}=require('../rightclick_helpers')
const blocks=require('../placement/block'),entities=require('../placement/entity')
module.exports={
 name:'rightclick',usage:'rightclick [hand|off-hand]',
 description:'One aimed right-click, hand default or off-hand. Entity, interactive block, placement or held item is chosen once; no fallback/retry. Placement confirms server effects; other requests may remain unconfirmed. Does not hold/repeat; use rightdown for sustained use. No automatic other-hand fallback',
 handler:withContract('rightclick',async(bot,args,agent,options={})=>{
  if(bot.currentWindow)return {ok:false,errorCode:'WINDOW_OPEN',error:'Close the inventory window before world right-click'}
  if(hasUse(bot))return {ok:false,errorCode:'ITEM_ALREADY_IN_USE',error:'rightup the active held-item request before rightclick'}
  const hand=args[0]||'hand',signal=options.signal
  await syncInventory(bot);signal?.throwIfAborted()
  const item=usedItem(bot,hand),block=aimedBlock(bot),hit=aimedEntity(bot,block),sneaking=!!bot.getControlState?.('sneak')
  const projectile=!!item&&['bow','crossbow','trident','snowball','egg','ender_pearl','splash_potion','lingering_potion'].includes(item.name)
  const projectileAtEntity=hit&&projectile&&!['villager','wandering_trader'].includes(hit.entity.name)
  if(hit&&!projectileAtEntity){
   const entity=hit.entity,local=hit.point.minus(entity.position)
   bot._client.write('use_entity',{target:entity.id,mouse:entity.name==='armor_stand'?2:0,hand:hand==='off-hand'?1:0,sneaking,x:local.x,y:local.y,z:local.z})
   return {ok:true,requested:true,confirmed:false,status:'requested',action:'rightclick',route:'entity-interaction',hand,target:{id:entity.id,name:entity.name},confirmation:'request-sent-only',output:'Entity right-click sent once; effect not confirmed'}
  }
  const blockFirst=!projectileAtEntity&&block&&interactive(block)&&!(sneaking&&(bot.heldItem||usedItem(bot,'off-hand')))
  if(blockFirst&&hand==='off-hand')return {ok:false,errorCode:'HAND_NOT_SUPPORTED',error:'Block activation uses main hand on this protocol; use rightclick hand. Off-hand placement, entity interaction and item use remain separate supported paths',changes:[]}
  if(!blockFirst&&item&&(entities.entityType(bot,item)||bot.registry.blocksByName[item.name])){
   if(!block)return {ok:false,errorCode:'NO_TARGET',error:'No aimed block for placement; no click sent',changes:[]}
   const kind=entities.entityType(bot,item)?'entity':'block',impl=kind==='entity'?entities:blocks
   const before=placementCounts(bot)
   const result=await impl.handler(bot,[],agent,{...options,hand,target:block})
   if(!result.ok&&result.changes==null){
    try{await syncInventory(bot);result.changes=inventoryChanges(before,placementCounts(bot));result.evidence=[...(result.evidence||[]),'server-inventory-snapshot'];result.output+=`; observed inventory changes: ${JSON.stringify(result.changes)}`}
    catch(_){result.changes=null;result.output+='; final inventory unknown'}
   }
   return {...result,action:'rightclick',placementKind:kind,route:'placement',hand}
  }
  const before=placementCounts(bot)
  if(blockFirst||(!projectileAtEntity&&block&&!airUse(bot,item))){
   const observation=observeBlock(bot,block.position);let window=null
   const opened=value=>{window=value};bot.on('windowOpen',opened)
   try{
    blockClick(bot,block,hand)
    await waitFor(()=>!!window||observation.stateId!==null,signal,opensWindow(block)?1500:500)
    await syncInventory(bot)
    const changes=inventoryChanges(before,placementCounts(bot)),state=observation.stateId
    const changed=state!==null&&state!==block.stateId
    if(changed)changes.push({kind:'block',position:position(block.position),before:block.name,after:bot.blockAt(block.position)?.name,beforeStateId:block.stateId,afterStateId:state})
    const confirmed=!!window||changed
    return {ok:true,requested:true,confirmed,status:confirmed?'completed':'requested',action:'rightclick',route:'block-interaction',hand,target:{block:block.name,position:position(block.position)},changes,evidence:[...(window?['server-window-open']:[]),...(changed?['server-block-update']:[]),'server-inventory-snapshot'],confirmation:confirmed?'server-effect':'request-sent-only',output:window?`Opened ${window.type}; use window to inspect contents`:changed?`Server block change confirmed for ${block.name}`:'Block right-click sent once; no resulting effect confirmed'}
   }finally{observation.close();bot.removeListener('windowOpen',opened)}
  }
  if(!item)return {ok:false,errorCode:'NO_TARGET',error:'No aimed entity/block or held item to right-click'}
  try{startUse(bot,hand);await sleep(50,signal)}finally{releaseUse(bot)}
  await syncInventory(bot)
  const changes=inventoryChanges(before,placementCounts(bot))
  return {ok:true,requested:true,confirmed:false,status:'requested',action:'rightclick',route:'item-use',hand,item:item.name,changes,evidence:['server-inventory-snapshot'],confirmation:'request-sent-only',output:`Right-clicked ${item.name} once and released; observed inventory changes: ${JSON.stringify(changes)}; other effects not confirmed`}
 })
}
