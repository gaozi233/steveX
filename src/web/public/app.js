import { getState, subscribe } from './lib/state.js'
import { initWebSocket, subscribeAgent } from './lib/ws-client.js'
import { fetchStatus, reloadConfig } from './lib/api.js'
import { hydrateIcons } from './lib/icons.js'
import { renderAgents, initAgents } from './pages/agents.js'
import { mountAgentDetail } from './pages/agent-detail.js'
import { mountWorld } from './pages/world.js'
import { renderConfigs } from './pages/configs.js'

const agentsList = document.getElementById('agents-list')
const searchInput = document.getElementById('agent-search')
const statusFilter = document.getElementById('status-filter')
const sortBy = document.getElementById('sort-by')
const reloadButton = document.getElementById('reload')
const newAgentButton = document.getElementById('new-agent')
const uptimeEl = document.getElementById('uptime')
const wsIndicator = document.getElementById('ws-indicator')
const sidebarWs = document.getElementById('sidebar-ws')
const sidebarDot = document.querySelector('.sidebar-status .dot')
let currentPage = '', disposePage = () => {}

function setHeader(title, subtitle) {
  const heading = document.querySelector('main h1')
  heading.textContent = title
  heading.nextElementSibling.textContent = subtitle
}
function setAgentControlsVisible(visible) {
  document.querySelector('section.controls').hidden = !visible
}
function enter(page) {
  disposePage(); disposePage = () => {}
  subscribeAgent(null)
  agentsList.replaceChildren()
  currentPage = page
  setAgentControlsVisible(page === 'Agents')
  reloadButton.hidden = page === 'Agent detail' || page === 'World'
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.textContent.trim() === (page === 'Agent detail' ? 'Agents' : page)))
}
function showAgentsPage() {
  enter('Agents'); setHeader('Agents', '')
  renderAgents(agentsList); disposePage = initAgents(agentsList)
}
function showConfigsPage() {
  enter('Configs'); setHeader('Configs', '配置管理'); renderConfigs(agentsList)
}
export function routePath(pathname) {
  if (pathname === '/world' || pathname === '/world/') return { page: 'world' }
  if (pathname === '/configs') return { page: 'configs' }
  const match = pathname.match(/^\/agents\/([^/]+)\/?$/)
  if (match) { try { return { page: 'detail', name: decodeURIComponent(match[1]) } } catch { return { page: 'missing' } } }
  return { page: pathname === '/' || pathname === '/agents' || pathname === '/agents/' ? 'agents' : 'missing' }
}
function renderRoute() {
  const route = routePath(location.pathname)
  if (route.page === 'agents') return showAgentsPage()
  if (route.page === 'configs') return showConfigsPage()
  if (route.page === 'world') { enter('World'); setHeader('World', ''); disposePage = mountWorld(agentsList); return }
  enter('Agent detail')
  if (route.page === 'missing') { setHeader('Not found', ''); agentsList.textContent = 'Page not found'; return }
  setHeader(route.name, 'Agent debug')
  disposePage = mountAgentDetail(agentsList, route.name)
}
function navigate(url) { history.pushState(null, '', url); renderRoute() }

document.querySelectorAll('.nav-item').forEach(item => {
  const label = item.textContent.trim()
  if (label === 'Agents' || label === 'Configs' || label === 'World') {
    item.href = label === 'Agents' ? '/agents' : label === 'World' ? '/world' : '/configs'
    item.dataset.agentLink = ''
  } else item.addEventListener('click', event => { event.preventDefault(); alert('Coming soon') })
})
document.addEventListener('click', event => {
  const link = event.target.closest('a[data-agent-link]')
  if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault(); navigate(link.getAttribute('href'))
})
window.addEventListener('popstate', renderRoute)
for (const [element, event, key] of [[searchInput, 'input', 'query'], [statusFilter, 'change', 'status'], [sortBy, 'change', 'sortBy']]) element.addEventListener(event, () => {
  getState().filters[key] = element.value.trim()
  if (currentPage === 'Agents') renderAgents(agentsList)
})
newAgentButton.addEventListener('click', () => alert('Coming soon'))
reloadButton.addEventListener('click', async () => { await reloadConfig(); if (currentPage === 'Agents') renderAgents(agentsList); else if (currentPage === 'Configs') renderConfigs(agentsList) })

function updateIndicators() {
  const state = getState()
  uptimeEl.textContent = `Uptime: ${state.uptimeSec}s`
  wsIndicator.textContent = state.wsConnected ? 'WS: online' : 'WS: offline'
  wsIndicator.className = state.wsConnected ? 'ws-online' : 'ws-offline'
  if (sidebarWs) sidebarWs.textContent = wsIndicator.textContent
  if (sidebarDot) sidebarDot.className = `dot ${state.wsConnected ? 'online' : 'offline'}`
}
hydrateIcons()
const closeSocket = initWebSocket()
renderRoute()
fetchStatus().catch(() => { wsIndicator.textContent = 'Status unavailable' })
const unsubscribe = subscribe(() => { updateIndicators(); if (currentPage === 'Agents') renderAgents(agentsList) })
const uptimeTimer = setInterval(() => { getState().uptimeSec++; if (!document.hidden) updateIndicators() }, 1000)
window.addEventListener('pagehide', () => { disposePage(); unsubscribe(); closeSocket?.(); clearInterval(uptimeTimer) }, { once: true })
window.addEventListener('pageshow', event => { if (event.persisted) location.reload() })
