// ── steveX Debug Console ──
// ES Module entry point. WebSocket-driven real-time agent monitoring.

import { getState, subscribe } from './lib/state.js'
import { initWebSocket } from './lib/ws-client.js'
import { fetchStatus, reloadConfig } from './lib/api.js'
import { hydrateIcons } from './lib/icons.js'
import { renderAgents, initAgents } from './pages/agents.js'
import { renderConfigs } from './pages/configs.js'

// ── DOM refs ──

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

let currentPage = 'Agents'

// ── Page controls visibility ──

function setAgentControlsVisible(visible) {
  const controls = document.querySelector('section.controls')
  if (controls) controls.hidden = !visible
}

// ── Sidebar navigation ──

function setActiveNav(activeLabel) {
  document.querySelectorAll('.nav-item').forEach(item => {
    const label = item.textContent.trim()
    item.classList.toggle('active', label === activeLabel)
  })
}

function setHeader(title, subtitle) {
  const titleEl = document.querySelector('main h1')
  if (!titleEl) return

  titleEl.textContent = title

  const subtitleEl = titleEl.nextElementSibling
  if (subtitleEl) {
    subtitleEl.textContent = subtitle
  }
}

function showAgentsPage() {
  if (currentPage !== 'Agents') agentsList.replaceChildren()
  currentPage = 'Agents'

  setActiveNav('Agents')
  setHeader('Agents', '智能体管理')
  setAgentControlsVisible(true)

  if (reloadButton) reloadButton.style.display = ''
  if (newAgentButton) newAgentButton.style.display = ''

  renderAgents(agentsList)
}

function showConfigsPage() {
  currentPage = 'Configs'

  setActiveNav('Configs')
  setHeader('Configs', '配置管理')
  setAgentControlsVisible(false)

  if (reloadButton) reloadButton.style.display = ''
  if (newAgentButton) newAgentButton.style.display = 'none'

  renderConfigs(agentsList)
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    const label = item.textContent.trim()
    e.preventDefault()

    if (label === 'Agents') {
      showAgentsPage()
      return
    }

    if (label === 'Configs') {
      showConfigsPage()
      return
    }

    alert('Coming soon')
  })
})

// ── Controls ──

searchInput.addEventListener('input', () => {
  const state = getState()
  state.filters.query = searchInput.value.trim()

  if (currentPage === 'Agents') {
    renderAgents(agentsList)
  }
})

statusFilter.addEventListener('change', () => {
  const state = getState()
  state.filters.status = statusFilter.value

  if (currentPage === 'Agents') {
    renderAgents(agentsList)
  }
})

sortBy.addEventListener('change', () => {
  const state = getState()
  state.filters.sortBy = sortBy.value

  if (currentPage === 'Agents') {
    renderAgents(agentsList)
  }
})

newAgentButton.addEventListener('click', () => {
  alert('Coming soon')
})

reloadButton.addEventListener('click', async () => {
  reloadButton.animate([
    { transform: 'translateY(0)' },
    { transform: 'translateY(-1px) scale(0.98)' },
    { transform: 'translateY(0)' }
  ], { duration: 220 })

  await reloadConfig()

  if (currentPage === 'Agents') {
    renderAgents(agentsList)
  }

  if (currentPage === 'Configs') {
    renderConfigs(agentsList)
  }
})

// ── WS & uptime indicators ──

let pendingAgentsRender = false

function scheduleAgentsRender() {
  if (pendingAgentsRender) return

  pendingAgentsRender = true

  const flush = () => {
    pendingAgentsRender = false

    if (currentPage === 'Agents') {
      renderAgents(agentsList)
    }
  }

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(flush)
  } else {
    setTimeout(flush, 0)
  }
}

function updateWsUI() {
  const { wsConnected } = getState()

  wsIndicator.textContent = wsConnected ? 'WS: online' : 'WS: offline'
  wsIndicator.className = wsConnected ? 'ws-online' : 'ws-offline'

  if (sidebarWs) {
    sidebarWs.textContent = wsIndicator.textContent
  }

  if (sidebarDot) {
    sidebarDot.className = `dot ${wsConnected ? 'online' : 'offline'}`
  }
}

function updateUptimeUI() {
  uptimeEl.textContent = `Uptime: ${getState().uptimeSec}s`
}

// ── Bootstrap ──

hydrateIcons()
initAgents(agentsList)
initWebSocket()

// Initial data load
fetchStatus().then(() => {
  if (currentPage === 'Agents') renderAgents(agentsList)
  updateUptimeUI()
  updateWsUI()
})

// React to state changes
subscribe(() => {
  updateWsUI()
  updateUptimeUI()

  scheduleAgentsRender()
})

// Uptime ticker client-side
setInterval(() => {
  const state = getState()
  state.uptimeSec += 1
  updateUptimeUI()
}, 1000)
