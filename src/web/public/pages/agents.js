// ── steveX Agents page ──
// Rendering + event handlers for the agent management view.

import { getState, subscribe } from '../lib/state.js'
import { connectAgent, disconnectAgent, sendCommand } from '../lib/api.js'
import { escapeHtml } from '../lib/utils.js'
import { hydrateIcons } from '../lib/icons.js'
import { initInventoryPreview } from '../lib/inventory-preview.js'

const PLACEHOLDER = {
  health: 20,
  maxHealth: 20,
  mode: 'Survival',
  model: 'deepseek-v4-flash',
  position: { x: '~', y: '~', z: '~' },
  action: 'Idle'
}

// Backend getStatus() already returns canonical field names.
// Fall back to PLACEHOLDER only when a field is truly missing.
function getAgentView(agent) {
  return {
    health: agent.health ?? PLACEHOLDER.health,
    maxHealth: agent.maxHealth ?? PLACEHOLDER.maxHealth,
    mode: agent.gameMode ?? PLACEHOLDER.mode,
    model: agent.model ?? PLACEHOLDER.model,
    position: agent.position ?? PLACEHOLDER.position,
    action: agent.currentAction ?? PLACEHOLDER.action
  }
}

function formatPosition(position) {
  const pos = position || PLACEHOLDER.position

  const x = pos.x ?? '~'
  const y = pos.y ?? '~'
  const z = pos.z ?? '~'

  return `x: ${x}, y: ${y}, z: ${z}`
}

function getHealthPercent(health, maxHealth) {
  if (!maxHealth || maxHealth <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((health / maxHealth) * 100)))
}

// ── Filter / sort ──

function filteredAgents() {
  const { agents, filters } = getState()
  const query = filters.query.toLowerCase()

  let list = agents.filter(agent => {
    const matchText = agent.name.toLowerCase().includes(query)
    const matchStatus =
      filters.status === 'all' ||
      (filters.status === 'online' ? agent.online : !agent.online)
    return matchText && matchStatus
  })

  list.sort((a, b) => {
    if (filters.sortBy === 'status') {
      return Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)
    }

    if (filters.sortBy === 'health') {
      const ah = getAgentView(a).health
      const bh = getAgentView(b).health
      return bh - ah || a.name.localeCompare(b.name)
    }

    return a.name.localeCompare(b.name, undefined, { numeric: true })
  })

  return list
}

// ── Agent card template ──

function agentCardHtml(agent) {
  const statusClass = agent.online ? 'online' : 'offline'
  const statusText = agent.online ? 'online' : 'offline'
  const username = agent.username || '\u2014'

  const view = getAgentView(agent)
  const percent = getHealthPercent(view.health, view.maxHealth)
  const position = formatPosition(view.position)

  return `
    <article class="agent-card" data-agent-name="${escapeHtml(agent.name)}">
      <div class="agent-header">
        <div class="agent-id">
          <h2>${escapeHtml(agent.name)}</h2>
          <span class="dot ${statusClass}" aria-hidden="true"></span>
          <span class="state-label" data-status="${agent.online ? 'online' : 'offline'}">${statusText}</span>
          <span class="pill username-pill" style="margin-left:8px;color:var(--muted);font-size:14px">${escapeHtml(username)}</span>
        </div>

        <div class="agent-actions">
          <button class="btn soft-success" type="button" data-action="connect" data-agent="${escapeHtml(agent.name)}">
            <span data-icon="link"></span>
            Connect
          </button>
          <button class="btn soft-danger" type="button" data-action="disconnect" data-agent="${escapeHtml(agent.name)}">
            <span data-icon="unlink"></span>
            Disconnect
          </button>
          <button class="btn ghost" type="button" data-action="log" data-agent="${escapeHtml(agent.name)}">
            <span data-icon="logs"></span>
            Agent Log
          </button>
        </div>
      </div>

      <div class="agent-body">
        <div class="stats-panel">
          <div class="stats-column">
            <div class="stat-row">
              <div class="stat-label">Health</div>
              <div class="stat-value">
                <span data-icon="heart"></span>
                <span class="health-wrap">
                  <span class="health-number">${view.health} / ${view.maxHealth}</span>
                  <span class="health-bar" aria-label="Health ${percent}%">
                    <span class="health-fill" style="--health:${percent}%"></span>
                  </span>
                </span>
              </div>
            </div>

            <div class="stat-row">
              <div class="stat-label">Game Mode</div>
              <div class="stat-value"><span data-icon="gamepad"></span>${escapeHtml(view.mode)}</div>
            </div>

            <div class="stat-row">
              <div class="stat-label">Model</div>
              <div class="stat-value"><span data-icon="brain"></span>${escapeHtml(view.model)}</div>
            </div>
          </div>

          <div class="stats-column">
            <div class="stat-row">
              <div class="stat-label">Position</div>
              <div class="stat-value"><span data-icon="pin"></span>${escapeHtml(position)}</div>
            </div>

            <div class="stat-row">
              <div class="stat-label">Current Action</div>
              <div class="stat-value"><span data-icon="walk"></span>${escapeHtml(view.action)}</div>
            </div>

            <div class="stat-row">
              <div class="stat-label">Status</div>
              <div class="stat-value"><span class="dot ${statusClass}"></span>${agent.online ? 'Online' : 'Offline'}</div>
            </div>
          </div>
        </div>

        <div class="command-stack">
          <form class="command-panel" data-action="command" data-agent="${escapeHtml(agent.name)}">
            <div class="command-title">Send Command <span>(to Agent)</span></div>
            <div class="command-row">
              <input type="text" name="message" placeholder="Enter command..." autocomplete="off" />
              <button class="btn send" type="submit">Send</button>
            </div>
          </form>

          <form class="command-panel" data-action="message" data-agent="${escapeHtml(agent.name)}">
            <div class="command-title">Send Message <span>(to LLM Planner)</span></div>
            <div class="command-row">
              <input type="text" name="message" placeholder="Enter message for LLM Planner..." autocomplete="off" />
              <button class="btn send" type="submit">Send</button>
            </div>
          </form>
        </div>
      </div>
      <details class="inventory-preview">
        <summary>Inventory <span class="inventory-readonly">Read only</span></summary>
        <div class="inventory-preview-content" aria-live="polite"></div>
      </details>
    </article>
  `
}

// ── Log modal ──

function showLogModal(name) {
  // Remove any existing modal
  const existing = document.getElementById('log-modal')
  if (existing) existing.remove()

  const entries = getState().logs[name] || []

  const modal = document.createElement('div')
  modal.id = 'log-modal'
  modal.className = 'log-modal-overlay'
  modal.innerHTML = `
    <div class="log-modal">
      <div class="log-modal-header">
        <h2>${escapeHtml(name)} <span>Agent Log</span></h2>
        <button class="log-modal-close" type="button">&times;</button>
      </div>
      <div class="log-modal-body">
        ${entries.length === 0 ? '<div class="log-empty">No log entries yet.</div>' : ''}
      </div>
    </div>
  `

  document.body.appendChild(modal)

  // Populate existing entries
  const body = modal.querySelector('.log-modal-body')
  for (const entry of entries) {
    body.appendChild(buildLogEntryEl(entry))
  }
  body.scrollTop = body.scrollHeight

  // Close handlers
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('.log-modal-close')) {
      modal.remove()
    }
  })

  // Subscribe for live updates while modal is open
  const unsub = subscribe(() => {
    if (!document.getElementById('log-modal')) {
      unsub()
      return
    }

    const currentEntries = getState().logs[name] || []
    const currentCount = body.children.length - (body.querySelector('.log-empty') ? 1 : 0)

    const empty = body.querySelector('.log-empty')
    if (empty && currentEntries.length > 0) empty.remove()

    for (let i = currentCount; i < currentEntries.length; i++) {
      body.appendChild(buildLogEntryEl(currentEntries[i]))
    }

    body.scrollTop = body.scrollHeight
  })
}

function buildLogEntryEl(entry) {
  const el = document.createElement('div')
  el.className = `log-entry ${entry.type}`

  const time = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString()
    : new Date().toLocaleTimeString()

  let html = ''
  switch (entry.type) {
    case 'cmd-start':
      html = `<span class="log-time">${time}</span> <span class="log-tag">[CMD]</span> \u2192 ${escapeHtml(entry.command)}`
      break
    case 'cmd-done':
      html = `<span class="log-time">${time}</span> <span class="log-tag">[CMD]</span> \u2190 ${escapeHtml(entry.command)}<br>${escapeHtml(entry.output)}`
      break
    case 'cmd-error':
      html = `<span class="log-time">${time}</span> <span class="log-tag">[CMD]</span> \u2715 ${escapeHtml(entry.command)}<br>${escapeHtml(entry.output)}`
      break
    case 'llm-input':
      html = `<span class="log-time">${time}</span> <span class="log-tag">[LLM]</span> \u2192 <em>${escapeHtml(entry.model)}</em><br>${escapeHtml(entry.prompt ? entry.prompt.slice(0, 2000) + (entry.prompt.length > 2000 ? '\u2026' : '') : '')}`
      break
    case 'llm-output':
      html = `<span class="log-time">${time}</span> <span class="log-tag">[LLM]</span> \u2190 <em>${escapeHtml(entry.model)}</em><br>${escapeHtml(entry.response ? entry.response.slice(0, 2000) + (entry.response.length > 2000 ? '\u2026' : '') : '')}`
      break
  }

  el.innerHTML = html
  return el
}

// ── Render the full agents list ──

export function renderAgents(container) {
  const list = filteredAgents()

  if (!list.length) {
    container.innerHTML = '<div class="empty-state">No agents match the current filters.</div>'
    return
  }

  container.querySelector('.empty-state')?.remove()

  // Smart diff: update existing cards, add new ones, remove gone ones
  const existingNames = new Set()

  list.forEach(agent => {
    existingNames.add(agent.name)

    let card = container.querySelector(`.agent-card[data-agent-name="${escapeHtml(agent.name)}"]`)

    if (!card) {
      const temp = document.createElement('div')
      temp.innerHTML = agentCardHtml(agent)
      card = temp.firstElementChild
      container.appendChild(card)
      hydrateIcons(card)
    }

    // Update dynamic parts without full re-render
    updateDynamicFields(card, agent)
  })

  // Remove cards for agents that no longer exist
  container.querySelectorAll('.agent-card').forEach(card => {
    if (!existingNames.has(card.dataset.agentName)) {
      card.remove()
    }
  })
}

function updateDynamicFields(card, agent) {
  const statusClass = agent.online ? 'online' : 'offline'
  const statusText = agent.online ? 'online' : 'offline'

  const view = getAgentView(agent)
  const percent = getHealthPercent(view.health, view.maxHealth)
  const position = formatPosition(view.position)

  // Header dot + state label
  const dot = card.querySelector('.agent-id .dot')
  if (dot) dot.className = `dot ${statusClass}`

  const label = card.querySelector('.agent-id .state-label')
  if (label) {
    label.textContent = statusText
    label.dataset.status = statusClass
  }

  // Username pill
  const usernamePill = card.querySelector('.username-pill')
  if (usernamePill) {
    usernamePill.textContent = agent.username || '\u2014'
  }

  // Update each stat row by label
  const statRows = card.querySelectorAll('.stat-row')

  statRows.forEach(row => {
    const lbl = row.querySelector('.stat-label')
    const val = row.querySelector('.stat-value')
    if (!lbl || !val) return

    const name = lbl.textContent.trim()

    if (name === 'Health') {
      const healthNumber = row.querySelector('.health-number')
      if (healthNumber) {
        healthNumber.textContent = `${view.health} / ${view.maxHealth}`
      }

      const healthBar = row.querySelector('.health-bar')
      if (healthBar) {
        healthBar.setAttribute('aria-label', `Health ${percent}%`)
      }

      const healthFill = row.querySelector('.health-fill')
      if (healthFill) {
        healthFill.style.setProperty('--health', `${percent}%`)
      }
    }

    if (name === 'Game Mode') {
      val.innerHTML = `<span data-icon="gamepad"></span>${escapeHtml(view.mode)}`
      hydrateIcons(val)
    }

    if (name === 'Model') {
      val.innerHTML = `<span data-icon="brain"></span>${escapeHtml(view.model)}`
      hydrateIcons(val)
    }

    if (name === 'Position') {
      val.innerHTML = `<span data-icon="pin"></span>${escapeHtml(position)}`
      hydrateIcons(val)
    }

    if (name === 'Current Action') {
      val.innerHTML = `<span data-icon="walk"></span>${escapeHtml(view.action)}`
      hydrateIcons(val)
    }

    if (name === 'Status') {
      val.innerHTML = `<span class="dot ${statusClass}"></span>${agent.online ? 'Online' : 'Offline'}`
    }
  })
}

// ── Event delegation ──

function handleClick(e) {
  const btn = e.target.closest('button[data-action]')
  if (!btn) return

  const name = btn.dataset.agent
  const action = btn.dataset.action

  if (action === 'connect') {
    connectAgent(name)
  } else if (action === 'disconnect') {
    disconnectAgent(name)
  } else if (action === 'log') {
    showLogModal(name)
  }
}

async function handleSubmit(e) {
  const form = e.target.closest('form.command-panel')
  if (!form) return

  e.preventDefault()

  const name = form.dataset.agent
  const action = form.dataset.action
  const input = form.querySelector('input[name="message"]')
  const value = input.value.trim()
  if (!value) return

  if (action === 'command') {
    await sendCommand(name, value)
  } else if (action === 'message') {
    alert('Coming soon')
  }

  input.value = ''
}

// ── Init ──

export function initAgents(container) {
  initInventoryPreview(container)
  container.addEventListener('click', handleClick)
  container.addEventListener('submit', handleSubmit)
}
