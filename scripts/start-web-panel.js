// Start only the dashboard; agents connect explicitly through the existing UI.
const { AgentManager } = require('../src/agent/agent_manager')
const { loadConfig } = require('../src/utils/config')
const { startWebServer } = require('../src/web/server')

const manager = new AgentManager(loadConfig)
const server = startWebServer(manager)
let closing = false
async function shutdown() {
  if (closing) return
  closing = true
  const timeout = setTimeout(() => process.exit(1), 10000)
  try { await manager.close() }
  finally {
    server.closeResources()
    server.close()
    server.closeAllConnections()
    clearTimeout(timeout)
  }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
