const api = require('../workstations')
module.exports = {
  name: 'window', description: 'Read current UI, scoped slots, empty slots, trades and options. Player region uses fixed inventory 9..44; window scope only container/workstation region. Never mix scopes; slotinfo reads details. Book UI is not a slot window', usage: 'window',
  handler: bot => {
    const book=require('../book_ui').describeBook(bot)
    if(book)return {ok:true,window:book,output:JSON.stringify(book)}
    return !bot.currentWindow ? { ok:false, errorCode:'NO_WINDOW', error:'No inventory window is open' } : api.guarded(async () => { const data = api.describe(bot, { compact: true }); return { ok: true, output: JSON.stringify(data), window: data } })
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
