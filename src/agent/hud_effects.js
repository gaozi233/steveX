const trackers = new WeakMap()
function hudEffectsPlugin(bot) {
  let tick = 0
  const observed = new WeakMap()
  trackers.set(bot, { observed, now: () => tick })
  const advance = () => { tick++ }
  const effect = (entity, value) => { if (entity === bot.entity) observed.set(value, tick) }
  const end = () => {
    bot.removeListener('physicsTick', advance)
    bot.removeListener('entityEffect', effect)
    trackers.delete(bot)
  }
  bot.on('physicsTick', advance)
  bot.on('entityEffect', effect)
  bot.once('end', end)
}
function hudEffects(bot, names) {
  const effects = []
  const tracker = trackers.get(bot)
  for (const value of Object.values(bot.entity?.effects || {})) {
    const registered = bot.registry?.effects?.[value.id] || bot.registry?.effectsArray?.find(e => e.id === value.id)
    const name = (registered?.name || '').replace(/^minecraft:/,'').replace(/([a-z])([A-Z])/g,'$1_$2').replace(/ /g,'_').toLowerCase()
    if (!names.includes(name)) continue
    const start = tracker?.observed.get(value)
    const infinite = value.duration === -1
    const ticks = Number.isFinite(value.duration) && value.duration >= 0 ? Math.max(0, value.duration - (start === undefined ? 0 : tracker.now() - start)) : null
    effects.push({ name, level: Number.isInteger(value.amplifier) ? value.amplifier + 1 : null,
      durationSeconds: ticks === null ? null : Math.ceil(ticks / 20),
      ...(infinite ? { infinite:true } : {}), durationSource: infinite ? 'infinite' : start === undefined ? 'last-known' : 'client-tick-estimate' })
  }
  effects.sort((a,b)=>a.name.localeCompare(b.name))
  if (!effects.length) return {}
  return { effects, effectText: ' | Effects: ' + effects.map(e=>`${e.name}${e.level === null ? '' : ' '+e.level} ${e.infinite ? 'infinite' : e.durationSeconds === null ? '?' : e.durationSeconds+'s'} (${e.durationSource})`).join(', ') }
}
module.exports = { hudEffectsPlugin, hudEffects }
