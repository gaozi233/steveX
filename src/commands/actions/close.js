/**
 * close — close the currently open window/container
 */
module.exports = {
  name: 'close',
  description: 'Close the current container window or local book UI; closing a book discards unsaved drafts (book done saves)',
  usage: 'close',
  async handler(bot) {
    if(require('../book_ui').closeBook(bot))return {ok:true,output:'Closed local book UI; unsaved draft discarded'}
    const w = bot.currentWindow || bot.inventory
    await bot.closeWindow(w)
    return { ok: true, output: 'Closed container' }
  }
}
