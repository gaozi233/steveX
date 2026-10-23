import { escapeHtml } from './utils.js'
import { updatePlannerTask } from './planner-controls.js'

export function inspectorHtml() {
  return `<details class="agent-inspector inspector-vision"><summary>View</summary>
    <div class="vision-toolbar"><button class="btn ghost" type="button" data-inspect-capture title="Capture current view"><span data-icon="refresh"></span>Capture</button><span data-vision-status role="status">Loading renderer status...</span></div>
    <figure class="agent-vision"><img data-vision-image hidden alt=""><figcaption data-vision-meta>No snapshot</figcaption></figure>
  </details>
  <details class="agent-inspector inspector-llm"><summary>LLM Input / Output</summary><div class="llm-trace-content" aria-live="polite">No model requests yet.</div></details>`
}

export function traceHtml(turns) {
  if (!turns.length) return '<p class="inspector-empty">No model requests in this session.</p>'
  return [...turns].reverse().map(turn => `<details class="llm-turn" data-request-id="${escapeHtml(turn.requestId)}">
    <summary><span>${escapeHtml(turn.model)}</span><span>${escapeHtml(turn.status)}</span><time>${escapeHtml(new Date(turn.startedAt).toLocaleTimeString())}</time>${turn.durationMs !== undefined ? `<span>${turn.durationMs} ms</span>` : ''}</summary>
    ${turn.inputTruncated || turn.outputTruncated ? '<p class="inspector-warning">Display limit reached; this record is truncated.</p>' : ''}
    <h4>Input</h4>${turn.messages.map(message => `<details class="llm-message"${message.role === 'user' ? ' open' : ''}><summary>${escapeHtml(message.role)}</summary><pre>${escapeHtml(message.content)}</pre></details>`).join('')}
    <h4>Output</h4><pre class="llm-response">${escapeHtml(turn.response ?? turn.error ?? 'Waiting for response...')}</pre>
    ${turn.command ? `<p class="llm-selected-command">Selected command: <code>${escapeHtml(turn.command)}</code></p>` : ''}
    ${turn.taskId ? `<p>Task <code>${escapeHtml(turn.taskId)}</code> | step ${escapeHtml(turn.step)}</p>` : ''}
    ${turn.timings ? `<h4>Timing / Reported Usage</h4><pre>${escapeHtml(JSON.stringify({ timings: turn.timings, usage: turn.usage ?? 'unavailable' }, null, 2))}</pre>` : ''}
    ${turn.executionStatus ? `<h4>Execution: ${escapeHtml(turn.executionStatus)}</h4>${turn.executionTruncated ? '<p>Execution display truncated</p>' : ''}<pre>${escapeHtml(turn.execution ?? turn.executionError ?? 'No command result')}</pre>` : ''}
  </details>`).join('')
}

export function initAgentInspector(container) {
  const states = new Map()
  const captures = new Map()
  let disposed = false
  const endpoint = name => `/api/agents/${encodeURIComponent(name)}`
  function render(card, state) {
    const data = state.data
    if (!data) return
    updatePlannerTask(card, data.task)
    const capture = captures.has(card)
    const button = card.querySelector('[data-inspect-capture]')
    button.disabled = capture || !data.online || !data.renderer.enabled || !data.renderer.connected
    const status = card.querySelector('[data-vision-status]')
    status.textContent = state.captureError || (capture ? 'Capturing...' : !data.online ? 'Agent offline' : !data.renderer.enabled
      ? 'Shared renderer disabled' : !data.renderer.connected ? 'Fabric renderer disconnected' : 'Ready')
    const observation = data.observation
    const image = card.querySelector('[data-vision-image]')
    const meta = card.querySelector('[data-vision-meta]')
    if (!observation) {
      image.hidden = true
      image.removeAttribute('src')
      meta.textContent = 'No snapshot'
    } else {
      const url = `${endpoint(data.agentName)}/observation/${encodeURIComponent(observation.frameId)}/rgb`
      if (image.getAttribute('src') !== url) {
        image.hidden = false
        image.alt = `${data.agentName} view at ${observation.observedAt}`
        image.src = url
      }
      const camera = observation.camera
      meta.textContent = `${observation.observedAt} | ${observation.width} x ${observation.height} | ${observation.dimension || '-'}${camera ? ` | yaw ${camera.yawDegrees}, pitch ${camera.pitchDegrees}` : ''}${state.captureError ? ' | Previous snapshot' : ''}`
    }
    const content = card.querySelector('.llm-trace-content')
    const signature = JSON.stringify(data.turns)
    if (state.traceSignature !== signature) {
      const first = state.traceSignature === undefined
      const expanded = new Set([...content.querySelectorAll('.llm-turn[open]')].map(turn => turn.dataset.requestId))
      const previousTurns = new Set([...content.querySelectorAll('.llm-turn')].map(turn => turn.dataset.requestId))
      const expandedMessages = new Set()
      content.querySelectorAll('.llm-turn').forEach(turn => turn.querySelectorAll('.llm-message').forEach((message, index) => {
        if (message.open) expandedMessages.add(`${turn.dataset.requestId}:${index}`)
      }))
      const scroll = content.scrollTop
      content.innerHTML = traceHtml(data.turns)
      content.querySelectorAll('.llm-turn').forEach((turn, index) => {
        turn.open = expanded.has(turn.dataset.requestId) || (first && index === 0)
        if (previousTurns.has(turn.dataset.requestId)) turn.querySelectorAll('.llm-message').forEach((message, index) => {
          message.open = expandedMessages.has(`${turn.dataset.requestId}:${index}`)
        })
      })
      content.scrollTop = scroll
      state.traceSignature = signature
    }
  }
  async function poll(card, state) {
    if (disposed || !card.isConnected || states.get(card) !== state) return
    const controller = new AbortController()
    state.controller = controller
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(`${endpoint(state.name)}/debug`, { signal: controller.signal, cache: 'no-store', headers: state.etag ? { 'If-None-Match': state.etag } : {} })
      if (response.status === 304) return
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Inspector unavailable')
      if (data.agentName !== state.name) throw new Error('Agent identity mismatch')
      if (disposed || states.get(card) !== state || !card.isConnected) return
      if (state.data?.sessionId !== data.sessionId) { state.captureError = null; state.traceSignature = undefined }
      state.data = data
      state.etag = response.headers.get('etag')
      render(card, state)
    } catch (error) {
      if (!disposed && states.get(card) === state && card.isConnected) {
        card.querySelector('[data-vision-status]').textContent = error.name === 'AbortError' ? 'Inspector timed out' : error.message
        card.querySelector('[data-inspect-capture]').disabled = true
        card.querySelector('[data-vision-image]').hidden = true
        card.querySelector('.llm-trace-content').textContent = error.message
        state.etag = null
        state.traceSignature = undefined
      }
    } finally {
      clearTimeout(timeout)
      if (!disposed && states.get(card) === state && card.isConnected) state.timer = setTimeout(() => poll(card, state), 1000)
    }
  }
  function stop(card) {
    const state = states.get(card)
    states.delete(card)
    if (state) { clearTimeout(state.timer); state.controller?.abort() }
  }
  function toggle(event) {
    if (!event.target.matches('.agent-inspector')) return
    const card = event.target.closest('.agent-card')
    if (!card.querySelector('.agent-inspector[open]')) return stop(card)
    if (states.has(card)) return
    const state = { name: card.dataset.agentName }
    states.set(card, state)
    poll(card, state)
  }
  async function click(event) {
    if (!event.target.closest('[data-inspect-capture]')) return
    const card = event.target.closest('.agent-card'), state = states.get(card)
    if (!state?.data || captures.has(card) || event.target.closest('button').disabled) return
    const controller = new AbortController()
    captures.set(card, controller)
    const timeout = setTimeout(() => controller.abort(), 75000)
    const sessionId = state.data.sessionId
    state.captureError = null
    render(card, state)
    try {
      const response = await fetch(`${endpoint(state.name)}/observe`, { method: 'POST', signal: controller.signal })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Capture failed')
      if (!result.preview || result.preview.sessionId !== sessionId) throw new Error('Capture belongs to a replaced session')
      if (state.data.sessionId === sessionId) state.data.observation = result.preview
      state.etag = null
    } catch (error) {
      state.captureError = error.name === 'AbortError' ? 'Capture timed out; snapshot not confirmed' : error.message
    } finally {
      clearTimeout(timeout)
      captures.delete(card)
      if (!disposed && states.get(card) === state && card.isConnected) render(card, state)
    }
  }
  function imageError(event) {
    if (!event.target.matches('[data-vision-image]')) return
    event.target.hidden = true
    event.target.closest('figure').querySelector('figcaption').textContent = 'Snapshot unavailable; capture again'
  }
  container.addEventListener('toggle', toggle, true)
  container.addEventListener('click', click)
  container.addEventListener('error', imageError, true)
  const observer = new MutationObserver(() => {
    for (const card of states.keys()) if (!card.isConnected) stop(card)
    for (const [card, controller] of captures) if (!card.isConnected) { controller.abort(); captures.delete(card) }
  })
  observer.observe(container, { childList: true, subtree: true })
  return () => {
    disposed = true
    observer.disconnect()
    for (const card of states.keys()) stop(card)
    for (const controller of captures.values()) controller.abort()
    captures.clear()
    container.removeEventListener('toggle', toggle, true)
    container.removeEventListener('click', click)
    container.removeEventListener('error', imageError, true)
  }
}
