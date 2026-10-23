function failure(code,message){return Object.assign(new Error(message),{code})}
function syncWindow(bot,window,{signal,timeoutMs=2000}={}) {
  signal?.throwIfAborted()
  if(!window)return Promise.reject(failure('INVENTORY_UNAVAILABLE','No inventory window to synchronize'))
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)return Promise.reject(failure('INVALID_TIMEOUT','Inventory sync timeout must be positive'))
  const protocol=!!bot.version&&typeof bot.supportFeature==='function'
  const modern=protocol&&bot.supportFeature('stateIdUsed')
  if(protocol&&!modern)return Promise.reject(failure('INVENTORY_SYNC_UNAVAILABLE','Server snapshot synchronization requires state-id protocol support'))
  return new Promise((resolve,reject)=>{
    let settled=false,timer
    const event=`setWindowItems:${window.id}`
    const current=()=>bot.currentWindow||bot.inventory
    const finish=error=>{
      if(settled)return;settled=true;clearTimeout(timer)
      bot.removeListener?.(event,received);bot.removeListener?.('end',ended);bot.removeListener?.('windowClose',closed)
      bot._client?.removeListener?.('respawn',replaced);signal?.removeEventListener('abort',aborted)
      error?reject(error):resolve()
    }
    const received=()=>finish(current()!==window?failure('WINDOW_CHANGED','Window changed during inventory synchronization'):null)
    const ended=()=>finish(failure('DISCONNECTED','Disconnected during inventory synchronization'))
    const closed=w=>{if(w===window)finish(failure('WINDOW_CHANGED','Window closed during inventory synchronization'))}
    const replaced=()=>finish(failure('WINDOW_CHANGED','Player/window session replaced during synchronization'))
    const aborted=()=>finish(signal.reason||failure('CANCELLED','Inventory synchronization cancelled'))
    timer=setTimeout(()=>finish(failure('INVENTORY_SYNC_TIMEOUT','No server inventory snapshot; inspect state before retrying')),timeoutMs)
    bot.on?.('end',ended);bot.on?.('windowClose',closed);signal?.addEventListener('abort',aborted,{once:true})
    try {
      if(current()!==window)throw failure('WINDOW_CHANGED','Window changed before synchronization')
      if(modern){
        bot.on(event,received);bot._client.on('respawn',replaced)
        const Item=require('prismarine-item')(bot.registry||bot.version)
        // Same non-mutating stale-state drag-end request as Mineflayer, but
        // all waiting/listeners here are owned, bounded and cancellable.
        bot._client.write('window_click',{windowId:window.id,stateId:-1,slot:-999,mouseButton:2,mode:5,changedSlots:[],cursorItem:Item.toNotch(window.selectedItem)})
      }else {
        // Injected snapshot backends/test doubles may not expose protocol metadata.
        if(typeof bot._syncWindow!=='function')throw failure('INVENTORY_SYNC_UNAVAILABLE','Server snapshot backend unavailable')
        Promise.resolve(bot._syncWindow(window)).then(received,finish)
      }
    } catch(error){finish(error)}
  })
}
const installed=new WeakSet()
function installInventorySync(bot){
  if(installed.has(bot)||!bot.version||!bot.supportFeature?.('stateIdUsed'))return
  const original=bot._syncWindow,bounded=window=>syncWindow(bot,window)
  bot._syncWindow=bounded;installed.add(bot)
  bot.once('end',()=>{if(bot._syncWindow===bounded)bot._syncWindow=original;installed.delete(bot)})
}
module.exports={syncWindow,installInventorySync}
