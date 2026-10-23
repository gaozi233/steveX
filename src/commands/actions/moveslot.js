/**
 * moveslot <sourceSlot> <destSlot> — move an item between slots
 */
module.exports = {
  name: 'moveslot',
  description: 'Move a source stack to a specified destination slot in the current window (or player inventory if closed); read window/inventory for slot indices. Not a world movement command',
  usage: 'moveslot <sourceSlot> <destSlot>',
  async handler(bot, args) {
    if (args.length < 2) return { ok: false, error: 'Usage: moveslot <sourceSlot> <destSlot>' }
    const [src, dest] = args.map(Number)
    if (isNaN(src) || isNaN(dest)) return { ok: false, error: 'Invalid slot numbers' }
    const slots = bot.currentWindow?.slots || bot.inventory?.slots || []
    if (!slots[src]) return { ok: false, error: `Source slot ${src} is empty` }
    await bot.moveSlotItem(src, dest)
    return { ok: true, output: `Moved item from slot ${src} to slot ${dest}` }
  }
}
