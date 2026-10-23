// Local UI fixture only. No Minecraft connection, credentials or paid model calls.
const http = require('node:http')
const { EventEmitter } = require('node:events')
const { Brain } = require('../src/agent/brain')
const { createApp } = require('../src/web/server/app')
const { setupWebSocket } = require('../src/web/server/ws')
const { getDebugStore } = require('../src/web/server/agent_debug')

async function startPreview(port = 8092) {
  const bus = new EventEmitter(), executions = []
  const agents = new Map(['Planner-A', 'Planner-B'].map(name => {
    const agent = { name, sessionId: name + '-fixture', config: { llm: { model: 'Mock provider - no API calls' } },
      bot: { version: '1.21.11' }, isOnline: () => true,
      executeCommand: async command => {
        executions.push({ name, command })
        return command === 'inventory slots' ? { ok: true, slots: [{ slot: 9, name: 'stone', count: 2 }] }
          : { ok: true, confirmed: false, output: 'Mock chat request only; no game connection' }
      } }
    agent.brainLoop = new Brain(agent, { apiKey: 'local-fixture-only', model: 'Mock provider - no API calls' }, bus,
      { allowedCommands: ['inventory', 'say'], intervalMs: 3600000 })
    agent.brainLoop.llm.chat = async messages => {
      await new Promise(resolve => setTimeout(resolve, 400))
      return /inventory slots ->/.test(messages[1].content) ? 'say mock inventory: stone x2' : 'inventory slots'
    }
    return [name, agent]
  }))
  const manager = { agents, eventBus: bus, config: {}, agentConfigs: new Map(),
    getStatus: () => [...agents.values()].map(agent => ({ name: agent.name, username: 'UI fixture', online: true, health: 20, maxHealth: 20,
      model: 'Mock provider - no API calls', brain: { running: agent.brainLoop.running, task: agent.brainLoop.getTaskStatus() } })) }
  const app = createApp(manager)
  let close
  const server = http.createServer((req, res) => {
    if (req.url === '/__fixture/stats') {
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ executions })); return
    }
    if (req.url === '/__fixture/close' && req.method === 'POST') {
      res.end('closing'); setTimeout(() => close(), 100); return
    }
    app(req, res)
  }).listen(port, '127.0.0.1')
  const wss = setupWebSocket(server, manager)
  close = () => {
    for (const agent of agents.values()) agent.brainLoop.stop()
    getDebugStore(manager).close()
    for (const client of wss.clients) client.terminate()
    wss.close(); server.closeAllConnections(); server.close()
  }
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  return { server, close, manager, executions }
}
if (require.main === module) startPreview(Number(process.argv[2] || 8092)).then(({ server }) => {
  console.log(`Mock planner preview: http://127.0.0.1:${server.address().port} (no Minecraft or model API calls)`)
}).catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { startPreview }
