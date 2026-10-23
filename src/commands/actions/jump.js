/**
 * jump — make the bot jump
 */
const { sleep } = require('../../agent/action_executor')
module.exports = {
  name: 'jump',
  description: 'Hold Space for durationMs (default 200, integer 1..30000), then release regardless of landing. Water ascent or repeated jumps after landing may occur while held. Only initial press may request elytra deployment if already airborne/equipped; never auto-uses fireworks. Cancellation releases key; not confirmed flight or landing',
  usage: 'jump [durationMs]',
  async handler(bot, args, agent, { signal } = {}) {
    const durationMs = args[0] === undefined ? 200 : Number(args[0])
    const entity = bot.entity
    const torso = bot.getEquipmentDestSlot?.('torso')
    const wing = bot.inventory?.slots?.[torso]
    const usableWing = wing?.name === 'elytra' && !(Number.isFinite(wing.maxDurability) && Number.isFinite(wing.durabilityUsed) && wing.durabilityUsed >= wing.maxDurability - 1)
    const deploy = entity?.onGround === false && !bot.vehicle && !entity.isInWater && !entity.isInLava && !entity.elytraFlying && usableWing
    let deploymentRequested = false, deploymentError
    bot.setControlState('jump', true)
    try {
      signal?.throwIfAborted()
      if (deploy) {
        try { await bot.elytraFly(); deploymentRequested = true }
        catch (error) { deploymentError = error.message }
      }
      await sleep(durationMs, signal)
    }
    finally { bot.setControlState('jump', false) }
    return { ok: true, confirmed: false, status: 'requested', durationMs, deploymentRequested,
      ...(deploymentError ? { deploymentError } : {}),
      output: `Released Space after ${durationMs}ms; ${deploymentRequested ? 'elytra deployment requested, not confirmed' : deploymentError ? 'elytra deployment rejected: ' + deploymentError : 'jump input only'}; landing not awaited; no fireworks used` }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
