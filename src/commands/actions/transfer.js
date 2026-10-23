/**
 * Deposit items from the open window's player inventory into its container area.
 */
module.exports = {
  name: 'transfer',
  description: 'Deposit from player inventory into the open container only, never withdraw; item name exact match preferred then substring, count defaults to 1. Cursor must be empty',
  usage: 'transfer <itemName> [count]',
  async handler(bot, args) {
    if (args.length < 1) return { ok: false, error: 'Usage: transfer <itemName> [count]' }
    const itemName = args[0].toLowerCase()
    const count = args[1] === undefined ? 1 : Number(args[1])
    if ((args[1] !== undefined && !/^\d+$/.test(args[1])) || !Number.isSafeInteger(count) || count < 1) return { ok: false, error: 'Invalid count' }

    const window = bot.currentWindow
    if (!window) return { ok: false, error: 'No container window open' }
    if (!Number.isInteger(window.inventoryStart) || window.inventoryStart < 1 ||
        !Number.isInteger(window.inventoryEnd) || window.inventoryEnd <= window.inventoryStart ||
        !Array.isArray(window.slots) || window.inventoryEnd > window.slots.length) {
      return { ok: false, error: 'Invalid container inventory range' }
    }
    if (window.selectedItem) return { ok: false, error: 'Empty the cursor before transferring items' }
    const items = window.slots.slice(window.inventoryStart, window.inventoryEnd).filter(Boolean)
    const item = items.find(i => i.name === itemName) || items.find(i => i.name.includes(itemName))
    if (!item) return { ok: false, error: `No "${itemName}" in inventory` }

    // Mineflayer transfer uses half-open ranges in the active window's slot space.
    await bot.transfer({
      window,
      itemType: item.type,
      metadata: item.metadata,
      nbt: item.nbt,
      count,
      sourceStart: window.inventoryStart,
      sourceEnd: window.inventoryEnd,
      destStart: 0,
      destEnd: window.inventoryStart
    })

    return { ok: true, output: `Transferred ${count} x ${item.name} to container` }
  }
}
