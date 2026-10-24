import { renderAgentDetail, initAgentDetail } from './agents.js'
import { subscribeAgent } from '../lib/ws-client.js'
import { escapeHtml } from '../lib/utils.js'
import { setFreshness } from '../lib/freshness.js'

export function mountAgentDetail(container, name) {
  const controller = new AbortController()
  let timer, release, request, generation = 0, disposed = false, missing = false
  const page = typeof document === 'undefined' ? null : document
  let lastAgent, checkedAt
  const mark = mode => setFreshness(container.querySelector('[data-agent-freshness]'),{checkedAt,mode})
  container.innerHTML = '<p role="status">Loading agent...</p>'
  subscribeAgent(name)
  async function refresh() {
    if (disposed || missing || page?.hidden) return
    const revision = ++generation
    request = new AbortController()
    const current = () => !disposed && !page?.hidden && revision === generation
    try {
      const response = await fetch(`/api/status?agent=${encodeURIComponent(name)}`, {
        signal: AbortSignal.any([controller.signal, request.signal, AbortSignal.timeout(5000)]), cache: 'no-store'
      })
      if (!response.ok) throw new Error('Agent status unavailable')
      const data = await response.json()
      if (!current()) return
      const agent = data.agents.find(agent => agent.name === name)
      if (!agent) {
        missing = true; subscribeAgent(null)
        release?.(); release = null
        container.innerHTML = `<p role="status">Agent not found: ${escapeHtml(name)}</p>`
        return
      }
      if (agent.online) {lastAgent=agent;checkedAt=Date.now()}
      const displayed=!agent.online && lastAgent ? {...agent,health:lastAgent.health,maxHealth:lastAgent.maxHealth,
        position:lastAgent.position,gameMode:lastAgent.gameMode} : agent
      renderAgentDetail(container, {...displayed,freshness:{checkedAt,mode:agent.online?'checked':'offline'}})
      if (!release) release = initAgentDetail(container)
      container.querySelector('[data-detail-error]')?.remove()
    } catch (error) {
      if (current()) {
        mark('error')
        let message = container.querySelector('[data-detail-error]')
        if (!message) { message = document.createElement('p'); message.dataset.detailError = ''; message.setAttribute('role', 'status'); container.prepend(message) }
        message.textContent = error.name === 'TimeoutError' ? 'Status request timed out' : error.message
      }
    } finally { if (current() && !missing) timer = setTimeout(refresh, 1000) }
  }
  function visibility() {
    ++generation; clearTimeout(timer); request?.abort()
    mark('paused')
    if (!page.hidden) refresh()
  }
  page?.addEventListener?.('visibilitychange', visibility)
  refresh()
  return () => {
    disposed = true; controller.abort(); clearTimeout(timer)
    page?.removeEventListener?.('visibilitychange', visibility)
    release?.(); subscribeAgent(null)
  }
}
