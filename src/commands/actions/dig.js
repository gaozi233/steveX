/**
 * dig — dig the block in front
 */
const { operation, digConfirmed } = require('../operation_result')
module.exports = {
  name: 'dig',
  description: 'Dig the block in sight',
  usage: 'dig',
  handler: operation('dig', async (bot, args, agent, { signal } = {}) => {
    const block = bot.blockAtCursor(4.5)
    if (!block) return { ok: false, errorCode: 'NO_TARGET', error: 'No block in sight' }
    if (!bot.canDigBlock(block)) return { ok: false, errorCode: 'TARGET_NOT_DIGGABLE', error: 'Block is not diggable or out of reach' }
    return digConfirmed(bot, block, signal)
  })
}
