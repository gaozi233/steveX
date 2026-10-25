const { loadConfig } = require('./utils/config')
const { AgentManager } = require('./agent/agent_manager')
const { startWebServer } = require('./web/server')

const manager = new AgentManager(loadConfig)

// Auto-connect all configured agents and attach their configured brains.
for (const name of manager.agentConfigs.keys()) {
  manager.connectAgent(name)
}

console.log('[info][main] Starting SteveX agents:', [...manager.agentConfigs.keys()])

const server = startWebServer(manager)

let closing = false
async function shutdown() {
  if (closing) return
  closing = true
  console.log('[info][main] Shutting down')
  const deadline = setTimeout(() => { console.error('[main] Shutdown timed out while draining tasks'); process.exit(1) }, 10000)
  try { await manager.close() }
  finally {
    try {await server.closeResources()}
    finally {server.close();server.closeAllConnections();clearTimeout(deadline)}
  }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
