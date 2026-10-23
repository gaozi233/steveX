/**
 * putaway <slot> — put item from a slot into empty inventory space
 */
module.exports = {
  name: 'putaway',
  description: 'Move the specified source slot item back into player inventory using native putAway; destination chosen automatically, no item-name search. Uses current window slot indices when open',
  usage: 'putaway <slot>',
  async handler(bot, args) {
    if (args.length < 1) return { ok: false, error: 'Usage: putaway <slot>' }
    const slot = parseInt(args[0], 10)
    if (isNaN(slot) || slot < 0) return { ok: false, error: 'Invalid slot number' }
    const slots = bot.currentWindow?.slots || bot.inventory?.slots || []
    if (!slots[slot]) return { ok: false, error: `Slot ${slot} is empty` }
    await bot.putAway(slot)
    return { ok: true, output: `Put away item from slot ${slot}` }
  }
}
