// Renderer/provider fixtures: validates Web behavior, never calls a paid model.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { randomUUID } = require('node:crypto')
const { createApp } = require('../src/web/server/app')
const { setupWebSocket } = require('../src/web/server/ws')
const { getDebugStore } = require('../src/web/server/agent_debug')

async function main() {
  const root = path.resolve(__dirname, '..')
  const output = path.join(root, 'runs/web-inspector-smoke')
  await fs.mkdir(output, { recursive: true })
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(root, 'runs/web-inventory-tools/node_modules/playwright'))
  const agents = new Map(['Fixture-A', 'Fixture-B'].map(name => [name, { name, sessionId: name + '-session', isOnline: () => true,
    config: { llm: { apiKey: 'fixture-private-key' } } }]))
  const manager = { agents, agentConfigs: new Map([...agents].map(([name, agent]) => [name, agent.config])), config: {}, eventBus: new EventEmitter(),
    getStatus: () => [...agents.values()].map(agent => ({ name: agent.name, online: agent.isOnline(), health: 20, maxHealth: 20 })) }
  manager.renderService = { config: { outputDir: output, memoryNamespace: 'fixture' }, ids: new Map([...agents.keys()].map(name => [name, name])), renderer: { isConnected: () => true } }
  let captures = 0, failCapture = false
  const onePixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNcAAAAASUVORK5CYII=', 'base64')
  const png = process.env.STEVEX_DEBUG_FIXTURE_IMAGE ? await fs.readFile(process.env.STEVEX_DEBUG_FIXTURE_IMAGE) : onePixel
  manager.captureObservation = async name => {
    captures++
    await new Promise(resolve => setTimeout(resolve, 150))
    if (failCapture) return { ok: false, error: 'Fixture capture rejected' }
    const frameId = randomUUID(), folder = path.join(output, 'fixture', name)
    await fs.mkdir(folder, { recursive: true })
    await fs.writeFile(path.join(folder, frameId + '.png'), png)
    return { ok: true, observation: { agentName: name, sessionId: agents.get(name).sessionId, revision: captures, observedAt: new Date().toISOString(),
      frame: { agentId: name, frameId, memoryNamespace: 'fixture', dimension: 'overworld', width: png.readUInt32BE(16), height: png.readUInt32BE(20), rgb: { file: frameId + '.png' } } } }
  }
  const server = createApp(manager).listen(0, '127.0.0.1')
  const wss = setupWebSocket(server, manager)
  await new Promise(resolve => server.once('listening', resolve))
  const store = getDebugStore(manager)
  const emit = (name, id, text, response) => {
    const common = { name, requestId: id, sessionId: agents.get(name).sessionId, model: 'Mock provider (no API call)', timestamp: Date.now() }
    manager.eventBus.emit('agent:llm:input', { ...common, messages: [{ role: 'system', content: 'System fixture-private-key' }, { role: 'user', content: text }], prompt: text })
    if (response !== undefined) manager.eventBus.emit('agent:llm:output', { ...common, response, command: 'pos', timestamp: Date.now() + 12 })
  }
  emit('Fixture-A', 'a-1', 'A-only input ' + 'long context '.repeat(400), 'A-only response <script>unsafe</script>')
  emit('Fixture-B', 'b-1', 'B-only input', 'B-only response')
  let browser
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    const card = name => page.locator(`[data-agent-name="${name}"]`)
    for (const name of agents.keys()) {
      await card(name).locator('.inspector-vision summary').click()
      await card(name).locator('.inspector-llm > summary').click()
    }
    await page.waitForFunction(() => document.querySelectorAll('.llm-turn').length === 2)
    assert.equal(captures, 0, 'opening panels must not trigger captures')
    assert.doesNotMatch(await card('Fixture-A').locator('.llm-trace-content').textContent(), /B-only|fixture-private-key/)
    assert.match(await card('Fixture-A').locator('.llm-trace-content').textContent(), /\[REDACTED\]/)
    assert.ok((await card('Fixture-A').locator('.llm-message pre').last().textContent()).length > 2000)
    assert.equal(await page.locator('.llm-trace-content script').count(), 0)
    await card('Fixture-A').locator('[data-inspect-capture]').click()
    await page.waitForFunction(() => document.querySelector('[data-agent-name="Fixture-A"] [data-vision-image]')?.naturalWidth > 0)
    assert.equal(captures, 1)
    assert.equal(await card('Fixture-B').locator('[data-vision-image]').isVisible(), false)
    const firstUrl = await card('Fixture-A').locator('[data-vision-image]').getAttribute('src')
    failCapture = true
    await card('Fixture-A').locator('[data-inspect-capture]').click()
    await page.waitForFunction(() => document.querySelector('[data-agent-name="Fixture-A"] [data-vision-status]')?.textContent.includes('rejected'))
    assert.equal(await card('Fixture-A').locator('[data-vision-image]').getAttribute('src'), firstUrl)
    failCapture = false
    emit('Fixture-A', 'a-failed', 'Request with provider error')
    manager.eventBus.emit('agent:llm:error', { name: 'Fixture-A', requestId: 'a-failed', sessionId: agents.get('Fixture-A').sessionId, error: 'fixture-private-key provider failure', timestamp: Date.now() })
    await page.waitForFunction(() => document.querySelectorAll('.llm-turn').length === 3)
    assert.doesNotMatch(await card('Fixture-A').locator('.llm-trace-content').textContent(), /fixture-private-key/)
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true })
    await page.reload()
    await card('Fixture-A').locator('.inspector-vision summary').click()
    await card('Fixture-A').locator('.inspector-llm > summary').click()
    await page.waitForFunction(() => document.querySelectorAll('.llm-turn').length === 2)
    assert.equal(captures, 2, 'refresh restores cached state without a capture/model call')
    agents.get('Fixture-A').sessionId = 'new-session'
    await page.waitForFunction(() => document.querySelectorAll('.llm-turn').length === 0 && !document.querySelector('[data-agent-name="Fixture-A"] [data-vision-image]').getAttribute('src'))
    emit('Fixture-A', 'new', 'New session input', 'New session output')
    await page.waitForFunction(() => document.querySelectorAll('.llm-turn').length === 1)
    await card('Fixture-A').locator('.llm-turn > summary').click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(errors, [])
    console.log('PASS: on-demand RGB capture, retained previous snapshot on failure, no auto captures/model calls, full roles/context, error/redaction, multi-agent/session isolation, reload recovery, desktop/mobile')
  } finally {
    await browser?.close()
    for (const client of wss.clients) client.terminate()
    await new Promise(resolve => wss.close(resolve))
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    store.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
