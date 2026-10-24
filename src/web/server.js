const http = require('http')
const { createApp } = require('./server/app')
const { setupWebSocket } = require('./server/ws')

/**
 * Start the Web management panel (Express + WebSocket).
 */

function startWebServer(manager) {
  const webConfig = manager.config.web
  const host = webConfig.host
  const port = webConfig.port

  const app = createApp(manager)
  const mapPlayers = require('./server/world_map_players').startWorldMapPlayers(manager)
  const server = http.createServer(app)
  server.once('close', () => { mapPlayers.close() })

  const wss = setupWebSocket(server, manager)
  server.closeResources = () => {
    mapPlayers.close()
    for (const client of wss.clients) client.terminate()
    wss.close()
  }

  server.listen(port, host, () => {
    console.log(`[info][web] Web panel listening on http://${host}:${port}`)
  })
  return server
}

module.exports = { startWebServer }
