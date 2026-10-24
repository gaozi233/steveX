// Human-only viewer configuration. No map data enters the agent/tool runtime.
function worldMapSettings(config) {
  if (!config?.enabled) return { enabled: false, audience: 'human' }
  const url = new URL(config.url)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('World map must use a dedicated loopback HTTP origin without credentials or a path')
  }
  return { enabled: true, audience: 'human', source: 'world-files', updates: 'asynchronous', url: url.href }
}

function registerWorldMapRoutes(app, manager) {
  app.get('/api/world-map/players/:uuid', (req, res) => {
    res.set('Cache-Control', 'no-store')
    const uuid=req.params.uuid
    if (!manager.config?.worldMap?.enabled || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(uuid)) {
      return res.status(404).json({ok:false,error:'Managed player not found'})
    }
    const entry=[...manager.agents.entries()].find(([,agent])=>
      (agent.bot?.entity?.uuid || agent.bot?.player?.uuid)?.toLowerCase()===uuid.toLowerCase())
    if (!entry) return res.status(404).json({ok:false,error:'Managed player not found'})
    const [name,agent]=entry,online=agent.isOnline()
    const health=online?manager.getAgentHealth(agent):{health:null,maxHealth:null}
    res.json({ok:true,player:{name,username:agent.getUsername(),uuid,online,
      health:health.health,maxHealth:health.maxHealth,
      gameMode:online?manager.getAgentGameMode(agent):null,
      position:online?manager.getAgentPosition(agent):null,
      currentAction:online?manager.getAgentAction(agent):null,observedAt:Date.now()}})
  })
  app.get('/api/world-map', (req, res) => {
    res.set('Cache-Control', 'no-store')
    try {
      const settings = worldMapSettings(manager.config?.worldMap)
      if (settings.enabled && (new URL(settings.url).origin === `${req.protocol}://${req.get('host')}`
          || Number(new URL(settings.url).port) === req.socket.localPort)) {
        throw new Error('World map must not point back to the SteveX panel')
      }
      res.json({ ok: true, ...settings })
    } catch { res.status(400).json({ ok: false, error: 'Invalid worldMap configuration; use a separate loopback HTTP port' }) }
  })
}

module.exports = { worldMapSettings, registerWorldMapRoutes }
