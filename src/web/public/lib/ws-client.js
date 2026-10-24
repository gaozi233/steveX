// ── steveX WebSocket client ──

import { setState, patchAgent, addLog, getState } from './state.js'
import { receivedAgents } from './freshness.js'

const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
let ws = null
let selectedAgent = null
const page = typeof document === 'undefined' ? null : document

export function subscribeAgent(name) {
  selectedAgent = name
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'subscribe', agent: page?.hidden ? null : name, paused: !!page?.hidden }))
}

export function initWebSocket() {
  let disposed = false, reconnectTimer, attempt = 0
  function connect() {
    if (disposed || page?.hidden) return
    const socket = new WebSocket(`${protocol}//${location.host}`)
    ws = socket
    socket.onopen = () => {
      if (disposed || ws !== socket) return
      attempt = 0
      setState({ wsConnected: true })
      subscribeAgent(selectedAgent)
    }
    socket.onclose = () => {
      if (disposed || ws !== socket) return
      setState({ wsConnected: false })
      scheduleReconnect()
    }
    socket.onerror = () => { if (ws === socket) socket.close() }
    socket.onmessage = event => { if (ws === socket) receive(event) }
  }
  function receive(event) {
    if (disposed || page?.hidden) return
    let data
    try {data=JSON.parse(event.data)} catch {return}
    if(!data || typeof data!=='object')return

    switch (data.type) {
      case 'snapshot':
        setState({
          agents: receivedAgents(data.agents,getState().agents),
          uptimeSec: data.uptimeSec
        })
        break

      case 'agent:connect':
        patchAgent(data.name, () => ({ online: true }))
        break

      case 'agent:disconnect':
        patchAgent(data.name, () => ({ online: false }))
        break

      case 'agent:update':
        setState({})
        break

      case 'agent:command:start':
        if (data.name !== selectedAgent) break
        addLog(data.name, 'cmd-start', {
          command: data.command,
          timestamp: data.timestamp
        })
        break

      case 'agent:command:done':
        if (data.name !== selectedAgent) break
        addLog(data.name, data.ok ? 'cmd-done' : 'cmd-error', {
          command: data.command,
          output: data.output || data.error || '',
          timestamp: data.timestamp
        })
        break

      case 'agent:llm:input':
        addLog(data.name, 'llm-input', {
          model: data.model,
          prompt: data.prompt,
          timestamp: data.timestamp
        })
        break

      case 'agent:llm:output':
        addLog(data.name, 'llm-output', {
          model: data.model,
          response: data.response,
          timestamp: data.timestamp
        })
        break
    }
  }
  function scheduleReconnect() {
    clearTimeout(reconnectTimer)
    if(disposed || page?.hidden)return
    const delay=Math.min(30000,1000*2**Math.min(attempt++,5))
    reconnectTimer=setTimeout(connect,delay)
  }
  function visibility() {
    clearTimeout(reconnectTimer)
    if(ws?.readyState===WebSocket.OPEN) subscribeAgent(selectedAgent)
    else if(!page.hidden && (!ws || ws.readyState===WebSocket.CLOSED)) connect()
  }
  page?.addEventListener?.('visibilitychange',visibility)
  connect()
  return () => {
    disposed=true;clearTimeout(reconnectTimer);selectedAgent=null
    page?.removeEventListener?.('visibilitychange',visibility)
    if(ws){ws.onmessage=null;ws.close()}
  }
}
