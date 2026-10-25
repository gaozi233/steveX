const { WebSocketServer } = require('ws')
const { agentSummary } = require('./agent_summary')
const SOFT_BUFFER=256*1024,HARD_BUFFER=1024*1024
function sendPayload(client,payload,snapshot=false) {
  if(client.readyState!==1)return true
  const bytes=Buffer.byteLength(payload),buffer=client.bufferedAmount||0
  if(bytes>HARD_BUFFER||buffer+bytes>HARD_BUFFER){client.terminate();return true}
  if(snapshot&&buffer>SOFT_BUFFER)return false
  try{client.send(payload,error=>{if(error)client.terminate()})}catch{client.terminate()}
  return true
}

function setupWebSocket(server, manager) {
  const wss = new WebSocketServer({ server, maxPayload: 4096 })
  const debugStore = require('./agent_debug').getDebugStore(manager)
  const listeners = []
  let snapshotDirty = true
  const send = (client, data) => sendPayload(client,JSON.stringify(data))
  const snapshot = () => ({ type: 'snapshot', agents: manager.getStatus({summary:true}).map(agentSummary), uptimeSec: Math.floor(process.uptime()) })
  const on = (event, handler) => { manager.eventBus?.on(event, handler); listeners.push([event, handler]) }
  wss.on('connection', client => {
    client.agentSubscription = null
    client.paused = false
    client.on('error',()=>client.terminate())
    send(client, snapshot())
    client.on('message', raw => {
      try {
        const message = JSON.parse(raw.toString())
        if (message.type !== 'subscribe') return
        const agent = typeof message.agent === 'string' && (manager.agents.has(message.agent) || manager.agentConfigs?.has(message.agent)) ? message.agent : null
        const wasPaused=client.paused
        client.paused=message.paused===true
        client.agentSubscription = agent
        send(client, { type: 'subscription', agent })
        if(wasPaused && !client.paused)send(client,snapshot())
      } catch { send(client, { type: 'subscription', agent: client.agentSubscription }) }
    })
  })
  for (const event of ['agent:task:update', 'agent:connect', 'agent:disconnect', 'agent:update']) on(event, () => { snapshotDirty = true })
  for (const event of ['agent:command:start', 'agent:command:done']) on(event, data => {
    snapshotDirty = true
    const clients=[...wss.clients].filter(client=>!client.paused && client.readyState===1 && client.agentSubscription===data.name)
    if(!clients.length)return
    const payload = JSON.stringify({ type: event, name: data.name, command: debugStore.clean(data.command),
      ...(event.endsWith(':done') ? { ok: data.ok, output: debugStore.clean(data.output || data.error || '') } : {}), timestamp: data.timestamp })
    for (const client of clients) sendPayload(client,payload)
  })
  // Full prompts/results are fetched only by an explicitly opened per-agent inspector.
  const interval = setInterval(() => {
    if (!snapshotDirty) return
    const clients=[...wss.clients].filter(client=>!client.paused && client.readyState===1)
    if(!clients.length)return
    const data = JSON.stringify(snapshot())
    snapshotDirty = false
    for (const client of clients) if(!sendPayload(client,data,true))snapshotDirty=true
  }, 1000)
  wss.once('close', () => {
    clearInterval(interval)
    for (const [event, handler] of listeners) manager.eventBus?.removeListener(event, handler)
    debugStore.close()
  })
  return wss
}
module.exports = { setupWebSocket, sendPayload }
