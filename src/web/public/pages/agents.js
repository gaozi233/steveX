// ── steveX Agents page ──
// Rendering + event handlers for the agent management view.

import { getState, subscribe } from '../lib/state.js'
import { connectAgent, disconnectAgent, sendCommand, sendPlannerMessage, stopPlanner, controlPlanner } from '../lib/api.js'
import { escapeHtml } from '../lib/utils.js'
import { hydrateIcons } from '../lib/icons.js'
import { initInventoryPreview } from '../lib/inventory-preview.js'
import { inspectorHtml, initAgentInspector } from '../lib/agent-inspector.js'
import { updatePlannerTask, syncPlannerLimits } from '../lib/planner-controls.js'

const PLACEHOLDER = {
  health: 20,
  maxHealth: 20,
  mode: 'Survival',
  model: 'Not configured',
  position: { x: null, y: null, z: null },
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

  const x = pos.x ?? '\u2014'
  const y = pos.y ?? '\u2014'
  const z = pos.z ?? '\u2014'

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

export function agentCardHtml(agent) {
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
          <button class="btn soft-success" type="button" data-action="connect" data-agent="${escapeHtml(agent.name)}" ${agent.online ? 'hidden' : ''}>
            <span data-icon="link"></span>
            Connect
          </button>
          <button class="btn soft-danger" type="button" data-action="disconnect" data-agent="${escapeHtml(agent.name)}" ${agent.online ? '' : 'hidden'}>
            <span data-icon="unlink"></span>
            Disconnect
          </button>
          <button class="btn ghost icon-button" type="button" data-action="log" data-agent="${escapeHtml(agent.name)}" title="Agent log" aria-label="Agent log">
            <span data-icon="logs"></span>
          </button>
        </div>
      </div>

      <div class="agent-body">
        <div class="stats-panel" aria-label="Agent state">
          <div class="stat-row">
            <div class="stat-label">Health</div>
            <div class="stat-value"><span data-icon="heart"></span><span class="health-wrap"><span class="health-number">${view.health} / ${view.maxHealth}</span><span class="health-bar" aria-label="Health ${percent}%"><span class="health-fill" style="--health:${percent}%"></span></span></span></div>
          </div>
          <div class="stat-row"><div class="stat-label">Game Mode</div><div class="stat-value"><span data-icon="gamepad"></span>${escapeHtml(view.mode)}</div></div>
          <div class="stat-row"><div class="stat-label">Position</div><div class="stat-value"><span data-icon="pin"></span>${escapeHtml(position)}</div></div>
          <div class="stat-row"><div class="stat-label">Current Action</div><div class="stat-value"><span data-icon="walk"></span>${escapeHtml(view.action)}</div></div>
        </div>

        <div class="command-stack">
          <form class="command-panel" data-action="command" data-agent="${escapeHtml(agent.name)}">
            <div class="command-title">Command</div>
            <div class="command-row">
              <input type="text" name="message" placeholder="Enter command..." autocomplete="off" />
              <button class="btn send" type="submit">Send</button>
            </div>
          </form>

          <form class="command-panel" data-action="message" data-agent="${escapeHtml(agent.name)}">
            <div class="command-title">LLM Planner <span class="planner-model" data-planner-model>${escapeHtml(view.model)}</span></div>
            <div class="command-row">
              <input type="text" name="message" maxlength="4000" aria-label="Planner task" placeholder="Enter task..." autocomplete="off" />
              <button class="btn send" type="submit">Send</button>
              <button class="btn" type="button" data-action="planner-stop" data-agent="${escapeHtml(agent.name)}" title="Cancel planner task"><span data-icon="unlink"></span>Cancel</button>
            </div>
            <div class="planner-options">
              <select name="operation" aria-label="Task message type"><option value="append">Follow-up</option><option value="new">New task</option></select>
              <select name="mode" aria-label="Planner run mode"><option value="once">One step</option><option value="continuous">Continuous</option></select>
              <label>Call limit <input type="number" name="maxCalls" min="1" max="1000" value="32" /></label>
              <label>Time limit (s) <input type="number" name="maxSeconds" min="1" max="3600" value="300" /></label>
            </div>
            <div class="planner-options">
              <button class="btn" type="button" data-action="planner-control" data-operation="continue" data-agent="${escapeHtml(agent.name)}" title="Continue current task" disabled><span data-icon="refresh"></span>Continue</button>
              <button class="btn" type="button" data-action="planner-control" data-operation="pause" data-agent="${escapeHtml(agent.name)}" title="Pause current task" disabled>Pause</button>
              <select name="finishState" aria-label="Task disposition"><option value="complete">Completed (manual)</option><option value="block">Blocked</option><option value="wait">Waiting for user</option></select>
              <button class="btn" type="button" data-action="planner-finish" data-agent="${escapeHtml(agent.name)}" title="Set task disposition" disabled><span data-icon="tasks"></span>Set status</button>
            </div>
            <output class="planner-task-meta" data-planner-task>No active task</output>
            <details class="planner-metrics" hidden><summary>Task details</summary><pre data-planner-details></pre></details>
            <div class="planner-feedback" role="status" aria-live="polite"></div>
            <pre class="planner-result" hidden></pre>
          </form>
        </div>
      </div>
      <details class="inventory-preview">
        <summary>Inventory <span class="inventory-readonly">Read only</span></summary>
        <div class="inventory-preview-content" aria-live="polite"></div>
      </details>
      ${inspectorHtml()}
    </article>
  `
}

// ── Log modal ──

let closeAgentLog = () => {}
function showLogModal(name) {
  closeAgentLog()
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
      closeAgentLog()
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
  closeAgentLog = () => { unsub(); modal.remove(); closeAgentLog = () => {} }
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

export function overviewCardHtml(agent) {
  const name = escapeHtml(agent.name)
  return `<article class="agent-card agent-overview" data-agent-name="${name}">
    <div class="agent-header"><div class="agent-id"><h2>${name}</h2><span class="dot ${agent.online ? 'online' : 'offline'}" aria-hidden="true"></span><span class="state-label" data-status="${agent.online ? 'online' : 'offline'}">${agent.online ? 'online' : 'offline'}</span><span class="username-pill">${escapeHtml(agent.username || '')}</span></div>
    <div class="agent-actions"><button class="btn soft-success" data-action="connect" data-agent="${name}" ${agent.online ? 'hidden' : ''}><span data-icon="link"></span>Connect</button><button class="btn soft-danger" data-action="disconnect" data-agent="${name}" ${agent.online ? '' : 'hidden'}><span data-icon="unlink"></span>Disconnect</button><button class="btn" data-action="agent-stop" data-agent="${name}" ${agent.online ? '' : 'disabled'}>Stop</button><a class="btn" data-agent-link href="/agents/${encodeURIComponent(agent.name)}"><span data-icon="configs"></span>Debug</a></div></div>
    <div class="overview-summary"><span>Task <strong data-overview-task>${escapeHtml(agent.brain?.task?.status || 'None')}</strong></span><span>Action <strong data-overview-action>${escapeHtml(agent.currentAction || 'Idle')}</strong></span></div><p class="overview-error" role="status"></p>
  </article>`
}

export function renderAgentDetail(container, agent) {
  const card = container.querySelector('.agent-card')
  if (!card || card.dataset.agentName !== agent.name) {
    container.innerHTML = `<a class="agent-back" data-agent-link href="/agents">Back to Agents</a>${agentCardHtml(agent)}`
    hydrateIcons(container)
  }
  updateDynamicFields(container.querySelector('.agent-card'), agent)
}

export function renderAgents(container) {
  const list = filteredAgents()

  if (!list.length) {
    container.innerHTML = '<div class="empty-state">No agents match the current filters.</div>'
    return
  }

  container.querySelector('.empty-state')?.remove()

  // Smart diff: update existing cards, add new ones, remove gone ones
  const existingNames = new Set()
  const existingCards = new Map([...container.querySelectorAll('.agent-card')].map(card => [card.dataset.agentName, card]))

  list.forEach((agent, index) => {
    existingNames.add(agent.name)

    let card = existingCards.get(agent.name)

    if (!card) {
      const temp = document.createElement('div')
      temp.innerHTML = overviewCardHtml(agent)
      card = temp.firstElementChild
      container.appendChild(card)
      hydrateIcons(card)
    }

    // Update dynamic parts without full re-render
    updateDynamicFields(card, agent)
    card.querySelector('[data-overview-task]').textContent = agent.brain?.task?.status || 'None'
    card.querySelector('[data-overview-action]').textContent = agent.currentAction || 'Idle'
    card.querySelector('[data-action="agent-stop"]').disabled = !agent.online
    if (container.children[index] !== card) container.insertBefore(card, container.children[index] || null)
  })

  // Remove cards for agents that no longer exist
  container.querySelectorAll('.agent-card').forEach(card => {
    if (!existingNames.has(card.dataset.agentName)) {
      card.remove()
    }
  })
}

function updateDynamicFields(card, agent) {
  updatePlannerTask(card, agent.brain?.task ?? null)
  const statusClass = agent.online ? 'online' : 'offline'
  const statusText = agent.online ? 'online' : 'offline'

  const view = getAgentView(agent)
  const percent = getHealthPercent(view.health, view.maxHealth)
  const position = formatPosition(view.position)

  // Header dot + state label
  card.querySelector('[data-action="connect"]').hidden = !!agent.online
  card.querySelector('[data-action="disconnect"]').hidden = !agent.online
  const model = card.querySelector('[data-planner-model]')
  if (model) model.textContent = view.model
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

    if (name === 'Position') {
      val.innerHTML = `<span data-icon="pin"></span>${escapeHtml(position)}`
      hydrateIcons(val)
    }

    if (name === 'Current Action') {
      val.innerHTML = `<span data-icon="walk"></span>${escapeHtml(view.action)}`
      hydrateIcons(val)
    }

  })
}

// ── Event delegation ──

function handleClick(e, { signal } = {}) {
  const btn = e.target.closest('button[data-action]')
  if (!btn) return

  const name = btn.dataset.agent
  const action = btn.dataset.action

  if (action === 'connect' || action === 'disconnect') {
    const request = action === 'connect' ? connectAgent : disconnectAgent
    request(name, { signal }).then(ok => { if (!ok) throw new Error('Connection request failed') }).catch(error => {
      if (signal?.aborted || !btn.isConnected) return
      const card = btn.closest('.agent-card')
      let feedback = card.querySelector('.overview-error')
      if (!feedback) { feedback = document.createElement('p'); feedback.className = 'overview-error'; feedback.setAttribute('role', 'status'); card.appendChild(feedback) }
      feedback.textContent = error.message
    })
  } else if (action === 'log') {
    showLogModal(name)
  } else if (action === 'agent-stop') {
    sendCommand(name, 'stop', { signal }).catch(error => {
      if (!signal?.aborted && btn.isConnected) btn.closest('.agent-card').querySelector('.overview-error').textContent = error.message
    })
  } else if (action === 'planner-stop') {
    const feedback = btn.closest('form').querySelector('.planner-feedback')
    stopPlanner(name, { signal }).then(() => { if (!signal?.aborted) feedback.textContent = 'Task cancelled' }).catch(error => { if (!signal?.aborted) feedback.textContent = error.message })
  } else if (action === 'planner-control' || action === 'planner-finish') {
    const form = btn.closest('form')
    const operation = action === 'planner-finish' ? form.elements.finishState.value : btn.dataset.operation
    const feedback = form.querySelector('.planner-feedback')
    btn.disabled = true
    controlPlanner(name, operation, form.elements.mode.value, form.dataset.taskId || undefined, { signal }).then(result => {
      if (signal?.aborted || !form.isConnected) return
      btn.disabled = false
      feedback.textContent = result.status === 'started' ? 'Task start accepted' : result.command ? `Step returned: ${result.command}` : result.task?.status || 'Task updated'
      if (result.result) { const box = form.querySelector('.planner-result'); box.textContent = JSON.stringify(result.result, null, 2); box.hidden = false }
      updatePlannerTask(form.closest('[data-agent-name]'), result.task)
      const details = form.closest('[data-agent-name]')?.querySelector('.inspector-llm')
      if (details) details.open = true
    }).catch(error => { if (!signal?.aborted) { feedback.textContent = error.message; btn.disabled = false } })
  }
}

async function handleSubmit(e, { signal } = {}) {
  const form = e.target.closest('form.command-panel')
  if (!form) return

  e.preventDefault()

  const name = form.dataset.agent
  const action = form.dataset.action
  const input = form.querySelector('input[name="message"]')
  const value = input.value.trim()
  if (!value) return

  if (action === 'command') {
    try { await sendCommand(name, value, { signal }) } catch (error) { if (!signal?.aborted) input.setCustomValidity(error.message) }
  } else if (action === 'message') {
    const button = form.querySelector('button[type="submit"]')
    if (button.disabled) return
    const feedback = form.querySelector('.planner-feedback')
    const resultBox = form.querySelector('.planner-result')
    button.disabled = true
    resultBox.hidden = true
    feedback.textContent = 'Waiting for planner...'
    try {
      const operation = form.elements.operation.value
      const options = { operation }
      if (operation === 'append' && form.dataset.taskId) options.taskId = form.dataset.taskId
      if (operation === 'new' || !form.dataset.taskId) options.limits = { maxCalls: Number(form.elements.maxCalls.value), maxDurationMs: Number(form.elements.maxSeconds.value) * 1000 }
      const result = await sendPlannerMessage(name, value, form.elements.mode.value, options, { signal })
      if (signal?.aborted || !form.isConnected) return
      feedback.textContent = result.status === 'queued' ? 'Follow-up queued for next step' : result.status === 'started' ? 'Task start accepted' : `Step returned: ${result.command || 'no command'}`
      updatePlannerTask(form.closest('[data-agent-name]'), result.task)
      if (result.result) { resultBox.textContent = JSON.stringify({ command: result.command, result: result.result }, null, 2); resultBox.hidden = false }
      if (input.value.trim() === value) input.value = ''
      const details = form.closest('[data-agent-name]')?.querySelector('.inspector-llm')
      if (details) details.open = true
    } catch (error) {
      if (signal?.aborted || !form.isConnected) return
      feedback.textContent = error.message
      if (error.result?.result) { resultBox.textContent = JSON.stringify(error.result, null, 2); resultBox.hidden = false }
    }
    finally { button.disabled = false }
    return
  }

  input.value = ''
}

// ── Init ──

export function initAgents(container) {
  const controller = new AbortController()
  const click = event => handleClick(event, { signal: controller.signal })
  container.addEventListener('click', click)
  return () => { controller.abort(); container.removeEventListener('click', click) }
}

export function initAgentDetail(container) {
  const controller = new AbortController()
  const releaseInventory = initInventoryPreview(container)
  const releaseInspector = initAgentInspector(container)
  const click = event => handleClick(event, { signal: controller.signal })
  const submit = event => handleSubmit(event, { signal: controller.signal })
  const change = event => {
    if (event.target.matches('form[data-action="message"] select[name="operation"]')) syncPlannerLimits(event.target.closest('form'))
  }
  container.addEventListener('click', click)
  container.addEventListener('submit', submit)
  container.addEventListener('change', change)
  return () => {
    controller.abort(); releaseInventory(); releaseInspector(); closeAgentLog()
    container.removeEventListener('click', click)
    container.removeEventListener('submit', submit)
    container.removeEventListener('change', change)
  }
}
