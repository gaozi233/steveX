/**
 * openentity — open an entity with an inventory (villager, minecart, llama, etc.)
 */
module.exports = {
  name: 'openentity',
  description: 'Open the aimed entity inventory within 4.5 blocks; villagers initialize the trade window required by trade. Unlike interactentity, requires pre-aim',
  usage: 'openentity',
  async handler(bot) {
    const entity = bot.entityAtCursor(4.5)
    if (!entity) return { ok: false, error: 'No entity in sight to open' }
    if (bot.currentWindow) return { ok: false, error: 'Close the current window first' }
    const window = entity.name === 'villager' ? await bot.openVillager(entity) : await bot.openEntity(entity)
    return { ok: true, output: `Opened entity: ${entity.name || entity.type}` }
  }
}
