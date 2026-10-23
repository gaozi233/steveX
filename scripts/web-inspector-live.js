// Development acceptance against the running real agents and hidden Fabric renderer.
// Uses a local mock provider for one harmless pos request, never a paid model.
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const base = 'http://127.0.0.1:8090'
const output = path.join(root, 'runs/web-inspector-dev')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label) {
  for (let i = 0; i < 300; i++) { if (await check()) return; await sleep(100) }
  throw new Error('Timed out: ' + label)
}
async function json(url, options) {
  const response = await fetch(base + url, options)
  const data = await response.json()
  assert.equal(response.ok && data.ok !== false, true, `${url}: ${JSON.stringify(data)}`)
  return data
}
async function main() {
  const report = { startedAt: new Date().toISOString(), paidModelCalls: 0, captures: [] }
  const configFile = path.join(output, 'agent.json')
  const config = JSON.parse(await fs.readFile(configFile, 'utf8'))
  assert.equal(config.agents.every(agent => !agent.brain?.enabled), true, 'Only use the dedicated disabled-Brain dev fixture')
  let requests = 0, mockBody
  const provider = http.createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return }
    let size = 0, chunks = []
    for await (const chunk of req) { size += chunk.length; if (size > 512000) { res.writeHead(413).end(); return } chunks.push(chunk) }
    mockBody = JSON.parse(Buffer.concat(chunks))
    requests++
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'pos' } }] }))
  }).listen(0, '127.0.0.1')
  await new Promise(resolve => provider.once('listening', resolve))
  try {
    const b = config.agents.find(agent => agent.name === 'Web-B')
    b.llm = { apiKey: 'local-fixture-only', model: 'Local mock (no paid model)', baseUrl: `http://127.0.0.1:${provider.address().port}/chat/completions` }
    b.brain = { enabled: true, goal: 'Read current position once for local UI acceptance.', allowedCommands: ['pos'], intervalMs: 3600000 }
    await fs.writeFile(configFile, JSON.stringify(config, null, 2))
    await json('/api/reload', { method: 'POST' })
    for (const name of ['Web-A', 'Web-B']) await json(`/api/agents/${name}/connect`, { method: 'POST' })
    await until(async () => (await json('/api/agents/Web-B/debug')).turns[0]?.status === 'responded', 'local provider request complete')
    await json('/api/agents/Web-B/brain/stop', { method: 'POST' })
    const trace = (await json('/api/agents/Web-B/debug')).turns[0]
    assert.equal(requests, 1)
    assert.equal(mockBody.messages[0].role, 'system')
    assert.equal(mockBody.messages[1].role, 'user')
    assert.deepEqual(trace.messages, mockBody.messages)
    assert.equal(trace.response, 'pos')
    assert.equal(trace.command, 'pos')
    assert.equal((await json('/api/agents/Web-A/debug')).turns.length, 0)
    report.localProvider = { requests, roles: trace.messages.map(message => message.role), status: trace.status, response: trace.response, exactMessagesMatched: true }
    for (const name of ['Web-A', 'Web-B', 'Web-A']) {
      const result = await json(`/api/agents/${name}/observe`, { method: 'POST', signal: AbortSignal.timeout(90000) })
      const observation = result.preview
      assert.equal(result.observation.agentName, name)
      assert.equal(result.observation.frame.agentId, name)
      const image = await fetch(base + observation.rgbUrl)
      assert.equal(image.status, 200)
      const png = Buffer.from(await image.arrayBuffer())
      assert.equal(png.readUInt32BE(16), observation.width)
      assert.equal(png.readUInt32BE(20), observation.height)
      await fs.writeFile(path.join(output, name + '-latest.png'), png)
      const wrongName = name === 'Web-A' ? 'Web-B' : 'Web-A'
      assert.equal((await fetch(base + observation.rgbUrl.replace(`/agents/${name}/`, `/agents/${wrongName}/`))).status, 404)
      report.captures.push({ name, frameId: observation.frameId, width: observation.width, height: observation.height })
    }
    const status = await json('/api/renderer/status')
    assert.equal(status.state.windowVisible, false)
    assert.equal(status.state.windowFocused, false)
    assert.equal(status.state.mouseGrabbed, false)
    assert.equal(status.state.rendering.onDemand, true)
    await sleep(1000)
    const idle = await json('/api/renderer/status')
    assert.equal(idle.state.rendering.idle, true)
    report.renderer = { hidden: true, focused: false, mouseGrabbed: false, onDemand: true, idle: true }
    report.passed = true
    console.log('PASS: real A-B-A RGB/identity isolation; hidden/unfocused/ungrabbed on-demand renderer; one local mock provider request with exact actual system/user messages and pos response, no paid calls')
  } finally {
    // Do not auto-start this one-shot mock on a future server restart.
    config.agents.find(agent => agent.name === 'Web-B').brain.enabled = false
    await fs.writeFile(configFile, JSON.stringify(config, null, 2))
    await fs.writeFile(path.join(output, 'inspector-live-results.json'), JSON.stringify(report, null, 2))
    provider.closeAllConnections()
    await new Promise(resolve => provider.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
