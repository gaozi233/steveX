const { WebSocketServer } = require('ws')
const { agentSummary } = require('./agent_summary')

function setupWebSocket(server, manager) {
  const wss = new WebSocketServer({ server, maxPayload: 4096 })
  const debugStore = require('./agent_debug').getDebugStore(manager)
  const listeners = []
  let snapshotDirty = true
  const send = (client, data) => { if (client.readyState === 1) client.send(JSON.stringify(data)) }
  const snapshot = () => ({ type: 'snapshot', agents: manager.getStatus().map(agentSummary), uptimeSec: Math.floor(process.uptime()) })
  const on = (event, handler) => { manager.eventBus?.on(event, handler); listeners.push([event, handler]) }
  wss.on('connection', client => {
    client.agentSubscription = null
    send(client, snapshot())
    client.on('message', raw => {
      try {
        const message = JSON.parse(raw.toString())
        if (message.type !== 'subscribe') return
        const agent = typeof message.agent === 'string' && manager.getStatus().some(a => a.name === message.agent) ? message.agent : null
        client.agentSubscription = agent
        send(client, { type: 'subscription', agent })
      } catch { send(client, { type: 'subscription', agent: client.agentSubscription }) }
    })
  })
  for (const event of ['agent:task:update', 'agent:connect', 'agent:disconnect', 'agent:update']) on(event, () => { snapshotDirty = true })
  for (const event of ['agent:command:start', 'agent:command:done']) on(event, data => {
    snapshotDirty = true
    const payload = { type: event, name: data.name, command: debugStore.clean(data.command),
      ...(event.endsWith(':done') ? { ok: data.ok, output: debugStore.clean(data.output || data.error || '') } : {}), timestamp: data.timestamp }
    for (const client of wss.clients) if (client.agentSubscription === data.name) send(client, payload)
  })
  // Full prompts/results are fetched only by an explicitly opened per-agent inspector.
  const interval = setInterval(() => {
    if (!snapshotDirty) return
    const data = snapshot()
    for (const client of wss.clients) send(client, data)
    snapshotDirty = false
  }, 1000)
  wss.once('close', () => {
    clearInterval(interval)
    for (const [event, handler] of listeners) manager.eventBus?.removeListener(event, handler)
    debugStore.close()
  })
  return wss
}
module.exports = { setupWebSocket }
