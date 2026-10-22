/**
 * xp — show experience
 */
module.exports = {
  name: 'xp',
  description: 'Show experience level and current level progress percentage',
  usage: 'xp',
  async handler(bot) {
    const finite = value => typeof value === 'number' && Number.isFinite(value)
    const experience = bot.experience || {}
    const level = finite(experience.level) ? experience.level : null
    const progress = finite(experience.progress) ? experience.progress : null
    const progressPercent = progress === null ? null : Math.round(progress * 1000) / 10
    return { ok: true, output: `Level: ${level ?? '?'} | Progress: ${progressPercent === null ? '?' : progressPercent.toFixed(1) + '%'}`,
      level, progressPercent }
  }
}
