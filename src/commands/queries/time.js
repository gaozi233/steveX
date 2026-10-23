/**
 * time — show game time information
 */
module.exports = {
  name: 'time',
  description: 'Read game clock as HH:MM (tick 0 = 06:00), raw timeOfDay and daylight-cycle state. Not sleeping eligibility; query weather and nearby when relevant and decide from observations',
  usage: 'time',
  async handler(bot) {
    const time = bot.time || {}
    const finite = value => typeof value === 'number' && Number.isFinite(value)
    const timeOfDay = finite(time.timeOfDay) ? ((time.timeOfDay % 24000) + 24000) % 24000 : null
    const minutes = timeOfDay === null ? null : Math.floor(((timeOfDay + 6000) % 24000) * 1440 / 24000)
    const clock = minutes === null ? null : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    const doDaylightCycle = typeof time.doDaylightCycle === 'boolean' ? time.doDaylightCycle : null
    return { ok: true, output: `Time: ${clock ?? '?'}${doDaylightCycle === false ? ' | Daylight cycle paused' : ''}`,
      clock, timeOfDay, doDaylightCycle }
  }
}

module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
