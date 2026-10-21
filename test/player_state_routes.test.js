const test = require('node:test')
const assert = require('node:assert/strict')
const { createApp } = require('../src/web/server/app')

test('player state and interaction routes select the named Mineflayer, not the renderer', async t => {
  const agents = new Map(['a', 'b'].map(name => [name, { name, sessionId: name,
    isOnline: () => true, bot: { entity: { uuid: name }, health: name === 'a' ? 10 : 20,
      inventory: { items: () => [{ name: name === 'a' ? 'apple' : 'diamond', count: 1 }] } },
    interactionMemory: { snapshot: () => ({ agentName: name, source: 'mineflayer-window', records: [] }) } }]))
  const commandList = require('../src/commands').loadCommands().list
  const server = createApp({ agents, commandList }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  const base = `http://127.0.0.1:${server.address().port}`
  const catalog = await (await fetch(base + '/api/commands')).json()
  assert.equal(catalog.ok, true)
  assert.ok(catalog.commands.some(command => command.name === 'window' && command.kind === 'query'))
  assert.ok(catalog.commands.some(command => command.name === 'station' && command.kind === 'action'))
  const a = await (await fetch(base + '/api/agents/a/state')).json()
  const b = await (await fetch(base + '/api/agents/b/state')).json()
  assert.equal(a.uuid, 'a'); assert.equal(b.uuid, 'b')
  assert.equal(a.inventory[0].name, 'apple'); assert.equal(b.inventory[0].name, 'diamond')
  assert.equal((await (await fetch(base + '/api/agents/a/memory/containers')).json()).source, 'mineflayer-window')
  assert.equal((await fetch(base + '/api/agents/missing/state')).status, 404)
  agents.get('a').isOnline = () => false
  assert.equal((await fetch(base + '/api/agents/a/state')).status, 400)
})
