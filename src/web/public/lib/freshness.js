export function timeLabel(value) {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], {hour12:false}) : null
}

export function freshnessText({checkedAt, mode = 'checked', label = 'Checked'} = {}) {
  const time = timeLabel(checkedAt)
  const reason = {error:'Update failed',offline:'Agent offline',disconnected:'Connection lost',paused:'Updates paused'}[mode]
  const stamp = time ? `${label} ${time}` : 'Not checked yet'
  return reason ? `${time ? 'Last known · ' : ''}${reason} · ${stamp}` : stamp
}

export function setFreshness(element, options = {}) {
  if (!element?.setAttribute) return
  element.textContent = freshnessText(options)
  element.dataset.freshness = options.mode || 'checked'
  const date = timeLabel(options.checkedAt) ? new Date(options.checkedAt).toISOString() : 'No successful check'
  element.title = `${date}. Successful fetch/validation time, not the last world change or a real-time guarantee.`
}

// Stamp successful transport delivery, not a fresh observation of every Minecraft field.
export function receivedAgents(agents, previous = [], now = Date.now()) {
  const old = new Map(previous.map(agent => [agent.name, agent]))
  return agents.map(agent => {
    if (agent.online) return {...agent, freshness:{checkedAt:now,label:'Received',mode:'checked'}}
    const last = old.get(agent.name)
    return {...agent,...(last?.freshness ? {health:last.health,maxHealth:last.maxHealth,gameMode:last.gameMode,position:last.position} : {}),
      freshness:{checkedAt:last?.freshness?.checkedAt,label:'Received',mode:'offline'}}
  })
}
