import { escapeHtml } from './utils.js'
import { updatePlannerTask } from './planner-controls.js'
import { setFreshness } from './freshness.js'
import { apiTraceHtml, contextTraceHtml, renderTraceRecords, traceReference } from './runtime-trace.js'

export function inspectorHtml() {
  return `<details class="agent-inspector inspector-vision"><summary>View</summary>
    <p class="data-freshness" data-vision-freshness>Not checked yet</p>
    <div class="vision-toolbar"><label>Perspective <select data-vision-perspective aria-label="Camera perspective" disabled><option value="first-person">First person</option><option value="third-person-back">Third person (back)</option><option value="third-person-front">Third person (front)</option></select></label><button class="btn ghost" type="button" data-inspect-capture title="Capture current view" disabled><span data-icon="refresh"></span>Capture</button><span data-vision-status role="status">Loading renderer status...</span></div>
    <figure class="agent-vision"><img data-vision-image hidden alt=""><figcaption data-vision-meta>No snapshot</figcaption></figure>
  </details>
  <details class="agent-inspector inspector-context"><summary>Context</summary><p class="data-freshness" data-context-freshness>Not checked yet</p><div class="context-trace-content">No context snapshots requested.</div></details>
  <details class="agent-inspector inspector-api"><summary>API Calls</summary><p class="data-freshness" data-api-freshness>Not checked yet</p><div class="api-trace-content">No API records requested.</div></details>
  <details class="agent-inspector inspector-llm"><summary>LLM Input / Output</summary><p class="data-freshness" data-llm-freshness>Not checked yet</p><div class="llm-trace-content" aria-live="polite">No model requests yet.</div></details>
  <p class="trace-navigation-status" data-trace-navigation role="status" hidden></p>`
}

export function traceHtml(turns) {
  if (!turns.length) return '<p class="inspector-empty">No model requests in this session.</p>'
  return [...turns].reverse().map(turn => `<details class="llm-turn" data-request-id="${escapeHtml(turn.requestId)}">
    <summary><span>${escapeHtml(turn.model)}</span><span>${escapeHtml(turn.status)}</span><time>${escapeHtml(new Date(turn.startedAt).toLocaleTimeString())}</time>${turn.durationMs !== undefined ? `<span>${turn.durationMs} ms</span>` : ''}</summary>
    <dl class="trace-identities"><dt>Request ID</dt><dd><code>${escapeHtml(turn.requestId || 'Not recorded')}</code></dd><dt>Context</dt><dd>${traceReference('context',turn.contextId)}</dd>
    <dt>API calls</dt><dd>${turn.callIds?.length?turn.callIds.map(id=>traceReference('api',id)).join(' '):'No explicit links recorded'}</dd></dl>
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
  const page = typeof document === 'undefined' ? null : document
  const endpoint = name => `/api/agents/${encodeURIComponent(name)}`
  function mark(card,state,mode) {
    for(const section of ['vision','llm','api','context'])setFreshness(card.querySelector(`[data-${section}-freshness]`),{checkedAt:state.checkedAt,mode,label:'Status checked'})
  }
  function snapshotMeta(card,state) {
    const observation=state.displayedObservation
    const meta=card.querySelector('[data-vision-meta]')
    if(!observation) {meta.textContent=state.imageError || (state.imageLoading?'Loading snapshot...':'No snapshot');return}
    const camera=observation.camera
    meta.textContent=`Snapshot · Captured ${observation.observedAt || 'time unknown'} | ${observation.perspective || 'first-person'}${observation.previewOnly?' (debug preview; no memory update)':''} | ${observation.width} x ${observation.height} | ${observation.dimension || '-'}${camera?` | yaw ${camera.yawDegrees}, pitch ${camera.pitchDegrees}`:''}${state.imageLoading?' | Loading newer snapshot':''}${state.imageError?' | '+state.imageError:''}${state.error || !state.data?.online?' | Last known':''}`
  }
  async function loadImage(card, state, image, url, observation) {
    if (page?.hidden) return
    state.imageController?.abort()
    const controller = new AbortController()
    state.imageController = controller
    state.imageUrl = url
    state.imageLoading = true
    state.imageError=null
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
      if (!response.ok) throw new Error('Snapshot unavailable')
      const blob = await response.blob()
      if (disposed || controller.signal.aborted || states.get(card) !== state || state.imageUrl !== url || !card.querySelector('.inspector-vision').open) return
      if (state.objectUrl) URL.revokeObjectURL(state.objectUrl)
      state.objectUrl = URL.createObjectURL(blob)
      state.displayedObservation=observation
      image.alt=`${state.name} snapshot captured ${observation.observedAt || 'at unknown time'}`
      image.src = state.objectUrl; image.hidden = false
    } catch (error) {
      if (!disposed && !page?.hidden && state.imageController===controller && states.get(card) === state) {
        image.hidden=!state.objectUrl;state.imageUrl=null
        state.imageError=error.name==='AbortError'?'Snapshot request timed out':error.message
      }
    } finally {
      clearTimeout(timer)
      if(state.imageController===controller) {
        state.imageLoading=false
        if(!disposed && states.get(card)===state)snapshotMeta(card,state)
      }
    }
  }
  function render(card, state) {
    if (page?.hidden) return
    const data = state.data
    if (!data) return
    mark(card,state,state.error?'error':data.online?'checked':'offline')
    for(const [section,field,renderer,selector,key] of [
      ['api','calls',apiTraceHtml,'.api-call','callId'],['context','contexts',contextTraceHtml,'.context-record','contextId']]) {
      if(!card.querySelector('.inspector-'+section)?.open || !Array.isArray(data[field]))continue
      const dropped=section==='api'?data.droppedCalls:data.droppedContexts
      const signature=JSON.stringify([data.sessionId,data[field],dropped])
      if(state[section+'Signature']!==signature) {
        renderTraceRecords(card.querySelector('.'+section+'-trace-content'),renderer(data[field],dropped),selector,key)
        state[section+'Signature']=signature
      }
    }
    if(Object.hasOwn(data,'task'))updatePlannerTask(card, data.task)
    if (card.querySelector('.inspector-vision').open) {
    const capture = captures.has(card)
    const button = card.querySelector('[data-inspect-capture]')
    button.disabled = capture || !!state.error || !data.online || !data.renderer.enabled || !data.renderer.connected
    const select = card.querySelector('[data-vision-perspective]')
    if (select) select.disabled = button.disabled
    const status = card.querySelector('[data-vision-status]')
    status.textContent = state.error || state.captureError || (capture ? 'Capturing...' : !data.online ? 'Agent offline' : !data.renderer.enabled
      ? 'Shared renderer disabled' : !data.renderer.connected ? 'Fabric renderer disconnected' : 'Ready')
    const observation = data.observation
    const image = card.querySelector('[data-vision-image]')
    const meta = card.querySelector('[data-vision-meta]')
    if (!observation) {
      state.imageController?.abort(); state.imageUrl = null
      image.hidden = true
      image.removeAttribute('src')
      state.displayedObservation=null
      meta.textContent = 'No snapshot'
    } else {
      const url = `${endpoint(data.agentName)}/observation/${encodeURIComponent(observation.frameId)}/rgb`
      if (state.imageUrl !== url) {
        if(data.online && !state.error)loadImage(card, state, image, url, observation)
      }
      snapshotMeta(card,state)
    }
    }
    if (!card.querySelector('.inspector-llm').open || !Array.isArray(data.turns)) {focusLinkedRecord(card,state);return}
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
    focusLinkedRecord(card,state)
  }
  async function poll(card, state) {
    if (disposed || page?.hidden || !card.isConnected || states.get(card) !== state) return
    const generation = state.generation = (state.generation || 0) + 1
    const current = () => !disposed && !page?.hidden && states.get(card) === state && state.generation === generation && card.isConnected
    const controller = new AbortController()
    state.controller = controller
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(`${endpoint(state.name)}/debug?section=${state.section}`, { signal: controller.signal, cache: 'no-store', headers: state.etag ? { 'If-None-Match': state.etag } : {} })
      if (response.status === 304) {
        if(current() && state.data) {
          if(state.data.online)state.checkedAt=Date.now()
          state.error=null;render(card,state)
        }
        return
      }
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Inspector unavailable')
      if (data.agentName !== state.name) throw new Error('Agent identity mismatch')
      if (!current()) return
      if (state.data?.sessionId !== data.sessionId) { releaseVision(card,state); state.checkedAt=undefined; state.captureError = null; state.traceSignature = undefined }
      if(!data.online && state.data?.sessionId===data.sessionId) {
        if(state.objectUrl)data.observation=state.data.observation
        if(Array.isArray(state.data.turns) && data.turns)data.turns=state.data.turns
      }
      state.data = data
      if(data.online)state.checkedAt=Date.now()
      state.error=null
      state.etag = response.headers.get('etag')
      render(card, state)
    } catch (error) {
      if (current()) {
        state.error=error.name==='AbortError'?'Inspector timed out':error.message
        mark(card,state,'error')
        for(const [section,field] of [['api','calls'],['context','contexts']]) {
          if(card.querySelector('.inspector-'+section)?.open && !Array.isArray(state.data?.[field]))card.querySelector('.'+section+'-trace-content').textContent=state.error
        }
        if(state.data) {state.etag=null;render(card,state);return}
        state.imageController?.abort(); state.imageUrl = null
        card.querySelector('[data-vision-status]').textContent = error.name === 'AbortError' ? 'Inspector timed out' : error.message
        card.querySelector('[data-inspect-capture]').disabled = true
        card.querySelector('[data-vision-image]').hidden = true
        card.querySelector('.llm-trace-content').textContent = error.message
        state.etag = null
        state.traceSignature = undefined
      }
    } finally {
      clearTimeout(timeout)
      if (current()) state.timer = setTimeout(() => poll(card, state), 1000)
    }
  }
  function releaseVision(card, state) {
    if (state) {
      state.imageController?.abort(); state.imageUrl = null; state.captureError = null
      if (state.objectUrl) URL.revokeObjectURL(state.objectUrl)
      state.objectUrl = null
      state.displayedObservation=null;state.imageError=null
    }
    captures.get(card)?.abort(); captures.delete(card)
    const image = card.querySelector('[data-vision-image]')
    image?.removeAttribute('src')
    if (image) image.hidden = true
  }
  function stop(card) {
    const state = states.get(card)
    states.delete(card)
    if (state) { clearTimeout(state.timer); state.controller?.abort() }
    releaseVision(card, state)
  }
  function toggle(event) {
    if (!event.target.matches('.agent-inspector')) return
    const card = event.target.closest('.agent-card')
    const sections=['vision','llm','context','api'].filter(section=>card.querySelector('.inspector-'+section)?.open)
    const vision=sections.includes('vision')
    if (!sections.length) return stop(card)
    const state = states.get(card) || { name: card.dataset.agentName }
    state.generation = (state.generation || 0) + 1
    clearTimeout(state.timer); state.controller?.abort()
    if (!vision) releaseVision(card, state)
    state.section = sections.join(',')
    state.etag = null
    states.set(card, state)
    mark(card,state,'checked')
    poll(card, state)
  }
  async function click(event) {
    if (page?.hidden) return
    const link=event.target.closest('[data-trace-jump]')
    if(link?.dataset?.traceJump) {
      const card=link.closest('.agent-card'),state=states.get(card),kind=link.dataset.traceJump
      if(!state || !['llm','api','context'].includes(kind))return
      state.focus={kind,id:link.dataset.traceId}
      const panel=card.querySelector('.inspector-'+kind)
      if(panel.open)focusLinkedRecord(card,state)
      else panel.open=true
      return
    }
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
      const perspective = card.querySelector('[data-vision-perspective]')?.value || 'first-person'
      const response = await fetch(`${endpoint(state.name)}/observe`, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perspective }) })
      const result = await response.json()
      if (disposed || controller.signal.aborted || states.get(card) !== state || !card.isConnected) return
      if (!response.ok || !result.ok) throw new Error(result.error || 'Capture failed')
      if (!result.preview || result.preview.sessionId !== sessionId) throw new Error('Capture belongs to a replaced session')
      if (state.data.sessionId === sessionId) state.data.observation = result.preview
      state.etag = null
    } catch (error) {
      if (!disposed && !page?.hidden && captures.get(card) === controller && states.get(card) === state && card.querySelector('.inspector-vision').open) state.captureError = error.name === 'AbortError' ? 'Capture timed out; snapshot not confirmed' : error.message
    } finally {
      clearTimeout(timeout)
      if (captures.get(card) === controller) captures.delete(card)
      if (!disposed && states.get(card) === state && card.isConnected) render(card, state)
    }
  }
  function focusLinkedRecord(card,state) {
    if(!state.focus)return
    const {kind,id}=state.focus,field={llm:'turns',api:'calls',context:'contexts'}[kind]
    if(!Array.isArray(state.data?.[field]))return
    const selector={llm:'.llm-turn',api:'.api-call',context:'.context-record'}[kind]
    const key={llm:'requestId',api:'callId',context:'contextId'}[kind]
    const record=[...card.querySelectorAll(selector)].find(element=>element.dataset[key]===id)
    const status=card.querySelector('[data-trace-navigation]')
    if(status) {status.hidden=!!record;status.textContent=record?'':'Linked record is not retained or was not recorded in this session: '+id}
    if(record) {record.open=true;record.scrollIntoView({block:'nearest'})}
    state.focus=null
  }
  function imageError(event) {
    if (!event.target.matches('[data-vision-image]')) return
    event.target.hidden = true
    event.target.closest('figure').querySelector('figcaption').textContent = 'Snapshot unavailable; capture again'
  }
  function changePerspective(event) {
    if (!event.target.matches('[data-vision-perspective]')) return
    const card = event.target.closest('.agent-card')
    const button = card.querySelector('[data-inspect-capture]')
    if (!button.disabled) button.click()
  }
  function keydown(event) {
    if (event.key !== 'F5' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
        || event.target.closest('input, textarea, [contenteditable="true"]')) return
    const card = container.querySelector('.agent-card')
    if (!card?.querySelector('.inspector-vision')?.open) return
    const button = card.querySelector('[data-inspect-capture]')
    const select = card.querySelector('[data-vision-perspective]')
    event.preventDefault()
    if (event.repeat || button.disabled || !select) return
    select.selectedIndex = (select.selectedIndex + 1) % 3
    changePerspective({ target: select })
  }
  container.addEventListener('toggle', toggle, true)
  container.addEventListener('click', click)
  container.addEventListener('change', changePerspective)
  window.addEventListener('keydown', keydown)
  container.addEventListener('error', imageError, true)
  function visibility() {
    for (const [card,state] of states) {
      state.generation = (state.generation || 0) + 1
      clearTimeout(state.timer); state.controller?.abort()
      mark(card,state,'paused')
      if(page.hidden) {
        if(state.imageLoading) state.imageUrl=null
        state.imageController?.abort()
        captures.get(card)?.abort(); captures.delete(card)
      } else { state.etag=null; poll(card,state) }
    }
  }
  page?.addEventListener?.('visibilitychange',visibility)
  const observer = new MutationObserver(() => {
    for (const card of states.keys()) if (!card.isConnected) stop(card)
    for (const [card, controller] of captures) if (!card.isConnected) { controller.abort(); captures.delete(card) }
  })
  observer.observe(container, { childList: true, subtree: true })
  return () => {
    disposed = true
    page?.removeEventListener?.('visibilitychange',visibility)
    observer.disconnect()
    for (const card of states.keys()) stop(card)
    for (const controller of captures.values()) controller.abort()
    captures.clear()
    container.removeEventListener('toggle', toggle, true)
    container.removeEventListener('click', click)
    container.removeEventListener('change', changePerspective)
    window.removeEventListener('keydown', keydown)
    container.removeEventListener('error', imageError, true)
  }
}
