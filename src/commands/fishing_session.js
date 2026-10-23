const {EventEmitter}=require('node:events')
const injectFishing=require('mineflayer/lib/plugins/fishing')
const {sleep}=require('../agent/action_executor')
const active=new WeakSet()

async function fishSession(bot,{signal,timeoutMs=30000}={}) {
  if(bot.heldItem?.name!=='fishing_rod')return {ok:false,errorCode:'NO_FISHING_ROD',error:'Hold a fishing rod before fishing'}
  if(bot.currentWindow)return {ok:false,errorCode:'WINDOW_OPEN',error:'Close the window before fishing'}
  if(active.has(bot))return {ok:false,errorCode:'FISHING_ACTIVE',error:'A fishing session is already active'}
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)return {ok:false,errorCode:'INVALID_TIMEOUT',error:'Fishing timeout must be positive finite milliseconds'}
  if(!bot._client?.on||!bot.registry?.entitiesByName?.fishing_bobber)return {ok:false,errorCode:'FISHING_UNAVAILABLE',error:'Fishing entity/packet support unavailable'}
  signal?.throwIfAborted()

  // Reuse Mineflayer's bite detection on a private event bridge. Detaching it
  // cancels this session's future actions without leaving bot.fish() running.
  const bridge=new EventEmitter(),proxy=Object.create(bot),slot=bot.quickBarSlot
  let live=true,connected=true,castSent=false,reelRequested=false,bobberId=null,removed=false,timer,outcome
  let rejectInterrupted
  const interrupted=new Promise((_,reject)=>{rejectInterrupted=reject})
  const sameRod=()=>bot.heldItem?.name==='fishing_rod'&&bot.quickBarSlot===slot
  const interrupt=(code,message)=>{live=false;rejectInterrupted(Object.assign(new Error(message),{code}))}
  const abort=()=>interrupt(signal?.reason?.code==='ACTION_TIMEOUT'?'ACTION_TIMEOUT':'CANCELLED','Fishing cancelled')
  const end=()=>{connected=false;interrupt('DISCONNECTED','Disconnected while fishing')}
  const changed=()=>{if(!sameRod())interrupt('ITEM_CHANGED','Fishing rod/selected slot changed')}
  const death=()=>interrupt('PLAYER_DIED','Player died while fishing')
  const spawn=packet=>{
    if(!castSent||packet.type!==bot.registry.entitiesByName.fishing_bobber.id||packet.objectData!==bot.entity.id)return
    if(bobberId!==null)return
    bobberId=packet.entityId
    if(live)bridge.emit('spawn_entity',packet)
  }
  const particles=packet=>{
    if(!live)return
    try{bridge.emit('world_particles',packet)}catch(e){interrupt('FISHING_FAILED',e.message)}
  }
  const destroy=packet=>{
    if(packet.entityIds?.includes(bobberId))removed=true
    if(live)bridge.emit('entity_destroy',packet)
  }
  Object.defineProperty(proxy,'_client',{value:bridge})
  proxy.activateItem=()=>{
    if(!live||!connected||!sameRod())throw Object.assign(new Error('Fishing session is no longer active'),{code:'FISHING_INACTIVE'})
    if(castSent)reelRequested=true
    else castSent=true
    bot.activateItem(false)
  }
  injectFishing(proxy)
  active.add(bot)
  bot._client.on('spawn_entity',spawn);bot._client.on('world_particles',particles);bot._client.on('entity_destroy',destroy)
  bot.on('end',end);bot.on('heldItemChanged',changed);bot.on('death',death)
  signal?.addEventListener('abort',abort,{once:true})
  timer=setTimeout(()=>interrupt('FISH_TIMEOUT',`No completed fishing cycle within ${timeoutMs}ms`),timeoutMs)
  try {
    signal?.throwIfAborted()
    await Promise.race([proxy.fish(),interrupted])
    outcome={ok:true,status:'requested',confirmed:false,evidence:['server-owned-bobber','server-bite-particles'],
      output:'Bite detected and reel request sent; catch and inventory gain not confirmed'}
  } catch(error) {
    const code=typeof error.code==='string'?error.code:signal?.aborted?'CANCELLED':'FISHING_FAILED'
    outcome={ok:false,errorCode:code,error:error.message,status:signal?.aborted?'cancelled':'failed',confirmed:false,
      evidence:bobberId===null?[]:['server-owned-bobber'],output:`Fishing incomplete: ${error.message}; catch not confirmed`}
  } finally {
    live=false
    clearTimeout(timer)
    signal?.removeEventListener('abort',abort)
    const cleanup={retractionRequested:false,bobberRemovalConfirmed:false}
    try {
      // A cast already in flight can arrive after cancellation. Wait briefly
      // for its ownership packet, never send a blind click that could recast.
      const until=Date.now()+500
      while(connected&&sameRod()&&castSent&&bobberId===null&&Date.now()<until)await sleep(25)
      if(connected&&sameRod()&&bobberId!==null&&!removed&&!reelRequested){
        bot.activateItem(false);reelRequested=true;cleanup.retractionRequested=true
      }
      const removalUntil=Date.now()+500
      while(connected&&bobberId!==null&&!removed&&Date.now()<removalUntil)await sleep(25)
      cleanup.bobberRemovalConfirmed=bobberId!==null&&removed
      if(!cleanup.bobberRemovalConfirmed)cleanup.note='Bobber removal unconfirmed; inspect before another cast'
    } catch(error) {cleanup.error=error.message}
    finally {
      bot._client.removeListener('spawn_entity',spawn);bot._client.removeListener('world_particles',particles);bot._client.removeListener('entity_destroy',destroy)
      bot.removeListener('end',end);bot.removeListener('heldItemChanged',changed);bot.removeListener('death',death)
      bridge.removeAllListeners();active.delete(bot)
      if(castSent&&sameRod())bot.usingHeldItem=false
    }
    outcome={...outcome,castSent,reelRequested,bobberId,catchConfirmed:false,cleanup}
    outcome.output+=`; cleanup: ${JSON.stringify(cleanup)}`
  }
  return outcome
}
module.exports={fishSession}
