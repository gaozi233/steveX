/**
 * time — show game time information
 */
module.exports = {
  name: 'time',
  description: 'Show game time, day and moon phase',
  usage: 'time',
  async handler(bot) {
    const time = bot.time || {}
    const finite = value => typeof value === 'number' && Number.isFinite(value)
    const timeOfDay = finite(time.timeOfDay) ? time.timeOfDay : null
    const day = finite(time.day) ? time.day : null
    const isDay = typeof time.isDay === 'boolean' ? time.isDay : null
    const moonPhase = finite(time.moonPhase) ? time.moonPhase : null
    const moon = ['full', 'waning gibbous', 'third quarter', 'waning crescent', 'new', 'waxing crescent', 'first quarter', 'waxing gibbous'][moonPhase] ?? '?'
    return { ok: true, output: `Time: ${timeOfDay ?? '?'} ticks | Day: ${day ?? '?'} | ${isDay === null ? '?' : isDay ? 'day' : 'night'} | Moon: ${moon}`,
      timeOfDay, day, isDay, moonPhase, doDaylightCycle: typeof time.doDaylightCycle === 'boolean' ? time.doDaylightCycle : null }
  }
}
