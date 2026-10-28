import { getState, subscribe } from './lib/state.js'
import { initWebSocket, subscribeAgent } from './lib/ws-client.js'
import { fetchStatus, reloadConfig } from './lib/api.js'
import { hydrateIcons } from './lib/icons.js'
import { renderAgents, initAgents } from './pages/agents.js'
import { mountAgentDetail } from './pages/agent-detail.js'
import { mountWorld } from './pages/world.js'
import { renderConfigs } from './pages/configs.js'
import { initLang, getLang, setLang, translate, translateTree, observeTranslations } from './lib/i18n.js'

// Some tests run this file in a bare VM context with imports stripped; keep the
// helpers total so those tests still exercise the routing logic.
const tr = typeof translate === 'function' ? translate : text => text
const trTree = typeof translateTree === 'function' ? translateTree : () => 0

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
const langSelect = document.getElementById('lang')
let currentPage = '', disposePage = () => {}

function setHeader(title, subtitle = '') {
  const heading = document.querySelector('main h1')
  heading.textContent = title
  heading.nextElementSibling.textContent = subtitle
}
function setAgentControlsVisible(visible) {
  document.querySelector('section.controls').hidden = !visible
}
// Page keys stay language-independent; only the visible labels are translated.
function enter(page) {
  disposePage(); disposePage = () => {}
  subscribeAgent(null)
  agentsList.replaceChildren()
  currentPage = page
  setAgentControlsVisible(page === 'agents')
  reloadButton.hidden = page === 'detail' || page === 'world'
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === (page === 'detail' ? 'agents' : page))
  })
}
function showAgentsPage() {
  enter('agents'); setHeader(tr('Agents'), '')
  renderAgents(agentsList); disposePage = initAgents(agentsList)
}
function showConfigsPage() {
  enter('configs'); setHeader(tr('Configs'), '配置管理'); renderConfigs(agentsList)
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
  if (route.page === 'agents') showAgentsPage()
  else if (route.page === 'configs') showConfigsPage()
  else if (route.page === 'world') { enter('world'); setHeader(tr('World'), ''); disposePage = mountWorld(agentsList) }
  else if (route.page === 'missing') { enter('missing'); setHeader(tr('Not found'), ''); agentsList.textContent = tr('Page not found') }
  else { enter('detail'); setHeader(route.name, tr('Agent debug')); disposePage = mountAgentDetail(agentsList, route.name) }
  trTree(agentsList)
}
function navigate(url) { history.pushState(null, '', url); renderRoute() }

document.querySelectorAll('.nav-item').forEach(item => {
  const page = item.dataset.page
  if (page === 'agents' || page === 'configs' || page === 'world') {
    item.href = page === 'agents' ? '/agents' : page === 'world' ? '/world' : '/configs'
    item.dataset.agentLink = ''
  } else item.addEventListener('click', event => { event.preventDefault(); alert(tr('Coming soon')) })
})
document.addEventListener('click', event => {
  const link = event.target.closest('a[data-agent-link]')
  if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault(); navigate(link.getAttribute('href'))
})
window.addEventListener('popstate', renderRoute)
for (const [element, event, key] of [[searchInput, 'input', 'query'], [statusFilter, 'change', 'status'], [sortBy, 'change', 'sortBy']]) element.addEventListener(event, () => {
  getState().filters[key] = element.value.trim()
  if (currentPage === 'agents') renderAgents(agentsList)
})
newAgentButton.addEventListener('click', () => alert(tr('Coming soon')))
reloadButton.addEventListener('click', async () => { await reloadConfig(); if (currentPage === 'agents') renderAgents(agentsList); else if (currentPage === 'configs') renderConfigs(agentsList) })

function updateIndicators() {
  const state = getState()
  uptimeEl.textContent = `Uptime: ${state.uptimeSec}s`
  wsIndicator.textContent = state.wsConnected ? 'WS: online' : 'WS: offline'
  wsIndicator.className = state.wsConnected ? 'ws-online' : 'ws-offline'
  if (sidebarWs) sidebarWs.textContent = wsIndicator.textContent
  if (sidebarDot) sidebarDot.className = `dot ${state.wsConnected ? 'online' : 'offline'}`
}

initLang()
if (langSelect) {
  langSelect.value = getLang()
  langSelect.addEventListener('change', event => setLang(event.target.value))
}
hydrateIcons()
trTree(document.body)
observeTranslations()
const closeSocket = initWebSocket()
renderRoute()
fetchStatus().catch(() => { wsIndicator.textContent = 'Status unavailable' })
const unsubscribe = subscribe(() => { updateIndicators(); if (currentPage === 'agents') renderAgents(agentsList) })
const uptimeTimer = setInterval(() => { getState().uptimeSec++; if (!document.hidden) updateIndicators() }, 1000)
window.addEventListener('pagehide', () => { disposePage(); unsubscribe(); closeSocket?.(); clearInterval(uptimeTimer) }, { once: true })
window.addEventListener('pageshow', event => { if (event.persisted) location.reload() })
