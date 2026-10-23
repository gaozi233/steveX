const stores = new WeakMap()
function attachChatContext(bot) {
  if (stores.has(bot)) return
  const messages=[]
  stores.set(bot,messages)
  const received=(text,position,signed,sender)=>{
    if(position==='game_info' || typeof text!=='string')return
    messages.push({source:'server-received',position:position||'unknown',...(sender?{sender}:{}),text:text.slice(0,1000)})
    if(messages.length>20)messages.splice(0,messages.length-20)
  }
  bot.on('messagestr',received)
  bot.once('end',()=>{bot.removeListener('messagestr',received);stores.delete(bot)})
}
function recentChat(bot) { return (stores.get(bot)||[]).map(message=>({...message})) }
module.exports={attachChatContext,recentChat}
