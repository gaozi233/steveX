/**
 * fish — cast and reel fishing rod
 */
module.exports = {
  name: 'fish',
  description: 'Go fishing with a fishing rod',
  usage: 'fish',
  async handler(bot) {
    if (bot.heldItem?.name !== 'fishing_rod') {
      return { ok: false, error: 'Hold a fishing rod before fishing' }
    }
    await bot.fish()
    return { ok: true, output: 'Finished fishing' }
  }
}
