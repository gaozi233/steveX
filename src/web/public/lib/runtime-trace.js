import { escapeHtml } from './utils.js'

export function traceReference(kind,id) {
  return typeof id==='string' && id ? `<button type="button" class="trace-reference" data-trace-jump="${kind}" data-trace-id="${escapeHtml(id)}">${escapeHtml(id)}</button>` : '<span class="trace-unrecorded">Not recorded</span>'
}
function pretty(value) {
  if(value===null || value===undefined)return 'Not recorded'
  if(typeof value!=='string')return JSON.stringify(value,null,2)
  try{return JSON.stringify(JSON.parse(value),null,2)}catch{return value}
}
export function apiTraceHtml(calls,dropped=0) {
  const warning=dropped?`<p class="inspector-warning">${Number(dropped)} older call records evicted by display limits.</p>`:''
  return warning+(calls.length?[...calls].reverse().map(call=>`<details class="api-call" data-call-id="${escapeHtml(call.callId)}">
    <summary><strong>${escapeHtml(call.apiName || '(invalid command)')}</strong><span>${escapeHtml(call.status)}</span><time>${escapeHtml(new Date(call.submittedAt).toLocaleTimeString())}</time></summary>
    <dl class="trace-identities"><dt>Call ID</dt><dd><code>${escapeHtml(call.callId)}</code></dd>
    <dt>Source</dt><dd>${escapeHtml(call.source)}</dd><dt>LLM request</dt><dd>${traceReference('llm',call.llmRequestId)}</dd>
    <dt>Context</dt><dd>${traceReference('context',call.contextId)}</dd><dt>Parent call</dt><dd>${traceReference('api',call.parentCallId)}</dd>
    <dt>Task / Node</dt><dd>${escapeHtml(call.taskId || 'Not recorded')} / ${escapeHtml(call.nodeId || 'Not recorded')}</dd></dl>
    ${call.argumentsTruncated || call.resultTruncated?'<p class="inspector-warning">Display limit reached; this record is truncated.</p>':''}
    <h4>Arguments</h4><pre>${escapeHtml(pretty(call.arguments))}</pre>
    <h4>Returned Result</h4><pre>${escapeHtml(call.result===undefined?(call.finishedAt?'No result returned':'Not returned yet'):pretty(call.result))}</pre>
    ${call.error?`<h4>Error</h4><pre>${escapeHtml(call.error)}</pre>`:''}
    <h4>Execution Timing</h4><pre>${escapeHtml(pretty({submittedAt:call.submittedAt,startedAt:call.startedAt ?? null,finishedAt:call.finishedAt ?? null,...call.timings}))}</pre>
  </details>`).join(''):'<p class="inspector-empty">No API calls recorded in this session.</p>')
}
export function contextTraceHtml(contexts,dropped=0) {
  if(!contexts.length)return '<p class="inspector-empty">No context snapshots recorded in this session.</p>'
  return (dropped?`<p class="inspector-warning">${Number(dropped)} older context snapshots evicted by display limits.</p>`:'')+[...contexts].reverse().map(context=>`<details class="context-record" data-context-id="${escapeHtml(context.contextId)}">
    <summary><code>${escapeHtml(context.contextId)}</code><time>${escapeHtml(new Date(context.recordedAt).toLocaleTimeString())}</time></summary>
    <dl class="trace-identities"><dt>LLM request</dt><dd>${context.requestIds?.length?context.requestIds.map(id=>traceReference('llm',id)).join(' '):traceReference('llm',context.requestId)}</dd><dt>Source</dt><dd>${escapeHtml(context.source)}</dd>
    <dt>Task ID</dt><dd>${escapeHtml(context.taskId || 'Not recorded')}</dd>
    <dt>API calls</dt><dd>${context.callIds?.length?context.callIds.map(id=>traceReference('api',id)).join(' '):'<span class="trace-unrecorded">No explicit links recorded</span>'}</dd></dl>
    <h4>Structured Goal / Constraints</h4><pre>${escapeHtml(pretty(context.structuredGoal))}</pre>
    <h4>Working Memory</h4><pre>${escapeHtml(pretty(context.workingMemory))}</pre>
    <h4>Evidence References</h4><pre>${escapeHtml(pretty(context.evidenceRefs))}</pre>
    <h4>${context.source==='llm-input'?'Submitted':'Recorded'} Messages</h4>${context.truncated?'<p class="inspector-warning">Context display truncated.</p>':''}
    ${context.messages?.length?'':'<p class="trace-unrecorded">Not recorded</p>'}
    ${(context.messages || []).map(message=>`<details class="context-message"><summary>${escapeHtml(message.role)}</summary><pre>${escapeHtml(message.content)}</pre></details>`).join('')}
  </details>`).join('')
}

export function renderTraceRecords(content,html,selector,key) {
  const opened=new Set([...content.querySelectorAll(selector+'[open]')].map(record=>record.dataset[key]))
  const messages=new Set()
  content.querySelectorAll(selector).forEach(record=>record.querySelectorAll('.context-message').forEach((message,index)=>{
    if(message.open)messages.add(record.dataset[key]+':'+index)
  }))
  const scroll=content.scrollTop
  content.innerHTML=html
  content.querySelectorAll(selector).forEach(record=>{
    record.open=opened.has(record.dataset[key])
    record.querySelectorAll('.context-message').forEach((message,index)=>{message.open=messages.has(record.dataset[key]+':'+index)})
  })
  content.scrollTop=scroll
}
