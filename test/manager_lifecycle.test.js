const test = require('node:test')
const assert = require('node:assert/strict')
const { AgentManager } = require('../src/agent/agent_manager')
const { sleep } = require('../src/agent/action_executor')
const { createApp } = require('../src/web/server/app')

test('reloads serialize, renderer stays optional, and close prevents new connects', async () => {
  const manager = new AgentManager(() => ({ agents: [], renderer: { enabled: false } }))
  let active = 0, peak = 0
  manager.disconnectAll = async () => {
    active++; peak = Math.max(peak, active)
    await sleep(5)
    active--
  }
  await Promise.all([manager.reload(), manager.reload()])
  assert.equal(peak, 1)
  assert.equal(manager.renderService, null)
  await manager.close()
  assert.equal(manager.connectAgent('missing'), false)
  await assert.rejects(manager.reload(), /closing/)
})

test('main HTTP observation endpoint degrades explicitly when renderer is disabled', async t => {
  const manager = new AgentManager(() => ({ agents: [], renderer: { enabled: false } }))
  manager.agents.set('plain', {
    captureObservation: async () => ({ ok: false, error: 'Shared renderer is disabled' }),
    executor: { tail: Promise.resolve() }, shutdown() {},
  })
  const server = createApp(manager).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await manager.close() })
  const base = `http://127.0.0.1:${server.address().port}`
  assert.deepEqual(await (await fetch(base + '/api/renderer/status')).json(), { enabled: false })
  const response = await fetch(base + '/api/agents/plain/observe', { method: 'POST' })
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /disabled/)
})
