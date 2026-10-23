/**
 * fish — cast and reel fishing rod
 */
module.exports = {
  name: 'fish',
  description: 'Automated fishing skill: with main-hand fishing rod, cast, wait for bite and reel in; not a single right-click',
  usage: 'fish',
  async handler(bot) {
    if (bot.heldItem?.name !== 'fishing_rod') {
      return { ok: false, error: 'Hold a fishing rod before fishing' }
    }
    await bot.fish()
    return { ok: true, output: 'Finished fishing' }
  }
}
