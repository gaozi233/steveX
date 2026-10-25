const api = require('./workstations')
const blockMethods = {
  furnace:'openFurnace',blast_furnace:'openFurnace',smoker:'openFurnace',
  enchanting_table:'openEnchantmentTable',anvil:'openAnvil',chipped_anvil:'openAnvil',damaged_anvil:'openAnvil'
}
function entityWindowMethod(entity) {
  if(entity.name==='villager')return 'openVillager'
  if(['chest_minecart','hopper_minecart'].includes(entity.name))return 'openEntity'
  return null
}
async function openWindow(bot,target,{entity=false,signal}={}) {
  signal?.throwIfAborted()
  api.attach(bot)
  const method=entity?entityWindowMethod(target):blockMethods[target.name] || 'openBlock'
  if(!method || typeof bot[method]!=='function')return {ok:false,errorCode:'INTERACTION_UNAVAILABLE',error:'Native window initialization unavailable; no fallback click sent'}
  let opened,aborted=false
  const observed=window=>{opened=window;if(aborted)closeOpened(window)}
  bot.on('windowOpen',observed)
  const closeOpened=window=>{if(window&&bot.currentWindow===window){try{bot.closeWindow(window)}catch{}}}
  const abort=()=>{aborted=true;closeOpened(opened)}
  signal?.addEventListener('abort',abort,{once:true})
  try {
    const pending=Promise.resolve().then(()=>{signal?.throwIfAborted();return bot[method](target)})
    // Cancellation releases the UI, but successors wait for native initialization
    // to settle so a late window cannot corrupt the next operation.
    const window=await pending
    if(aborted||signal?.aborted){closeOpened(window);signal?.throwIfAborted();throw Error('Window opening cancelled')}
    if(!window||bot.currentWindow!==window)return {ok:false,errorCode:'WINDOW_NOT_CONFIRMED',error:'Native opening returned without the expected active window'}
    return {ok:true,requested:true,confirmed:true,status:'completed',route:'window-open',hand:'hand',
      window:{type:window.type},evidence:['server-window-open','native-window-initialization'],
      output:`Opened ${window.type}; native initialization complete. Use window to inspect slots/options; no contents changed`}
  }finally{bot.removeListener('windowOpen',observed);signal?.removeEventListener('abort',abort)}
}
module.exports={openWindow,entityWindowMethod}
