import { renderAgentDetail, initAgentDetail } from './agents.js'
import { subscribeAgent } from '../lib/ws-client.js'
import { escapeHtml } from '../lib/utils.js'

export function mountAgentDetail(container, name) {
  const controller = new AbortController()
  let timer, release, disposed = false, missing = false
  container.innerHTML = '<p role="status">Loading agent...</p>'
  subscribeAgent(name)
  async function refresh() {
    try {
      const response = await fetch(`/api/status?agent=${encodeURIComponent(name)}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]), cache: 'no-store'
      })
      if (!response.ok) throw new Error('Agent status unavailable')
      const data = await response.json()
      if (disposed) return
      const agent = data.agents.find(agent => agent.name === name)
      if (!agent) {
        missing = true; subscribeAgent(null)
        release?.(); release = null
        container.innerHTML = `<a class="agent-back" data-agent-link href="/agents">Back to Agents</a><p role="status">Agent not found: ${escapeHtml(name)}</p>`
        return
      }
      renderAgentDetail(container, agent)
      if (!release) release = initAgentDetail(container)
      container.querySelector('[data-detail-error]')?.remove()
    } catch (error) {
      if (!disposed) {
        let message = container.querySelector('[data-detail-error]')
        if (!message) { message = document.createElement('p'); message.dataset.detailError = ''; message.setAttribute('role', 'status'); container.prepend(message) }
        message.textContent = error.name === 'TimeoutError' ? 'Status request timed out' : error.message
      }
    } finally { if (!disposed && !missing) timer = setTimeout(refresh, 1000) }
  }
  refresh()
  return () => {
    disposed = true; controller.abort(); clearTimeout(timer)
    release?.(); subscribeAgent(null)
  }
}
