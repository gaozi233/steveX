const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

test('overview is lightweight while a single-agent template retains lazy debug panels', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/web/public/pages/agents.js'), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const listeners = {}
  let previews = 0
  const context = vm.createContext({
    AbortController,
    initInventoryPreview:()=>{previews++},
    initAgentInspector:()=>{}, inspectorHtml:()=>'<details class="agent-inspector"></details>',
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  })
  vm.runInContext(source, context)
  context.initAgents({ addEventListener: (event, handler) => { listeners[event] = handler } })
  assert.equal(previews, 0)
  assert.equal(typeof listeners.click, 'function')
  assert.equal(listeners.submit, undefined)
  const overview = vm.runInContext('overviewCardHtml({name:"a/b", online:true})', context)
  assert.doesNotMatch(overview, /inventory-preview|agent-inspector|command-panel|LLM Planner/)
  assert.match(overview, /href="\/agents\/a%2Fb"/)
  assert.match(overview, /data-action="agent-stop"/)
  const html = vm.runInContext('agentCardHtml({name:"test", online:true})', context)
  assert.doesNotMatch(html, /Command Catalog|command-catalog/)
  assert.doesNotMatch(source, /\/api\/commands/)
  assert.match(html, /inventory-preview/)
  assert.match(html, /class="command-title">Command/)
  assert.match(html, /LLM Planner <span class="planner-model"/)
  assert.doesNotMatch(html, /class="stat-label">Status|class="stat-label">Model|stats-column/)
  assert.match(html, /data-action="connect"[^>]*hidden/)
  assert.doesNotMatch(html, /data-action="disconnect"[^>]*hidden/)
  assert.match(html, /x: —, y: —, z: —/)
  assert.match(html, /title="Agent log" aria-label="Agent log"/)
  const offline = vm.runInContext('agentCardHtml({name:"offline", online:false, model:"<unsafe>"})', context)
  assert.match(offline, /data-action="disconnect"[^>]*hidden/)
  assert.doesNotMatch(offline, /data-action="connect"[^>]*hidden/)
  assert.match(offline, /&lt;unsafe&gt;/)
  assert.match(html, /name="mode"/)
  assert.match(html, /value="once">One step/)
  assert.match(html, /planner-stop/)
  assert.match(html, /planner-result/)
  assert.doesNotMatch(source, /alert\('Coming soon'\)/)
})

test('agent status refresh switches connection controls and updates planner model safely', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/web/public/pages/agents.js'), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const context = vm.createContext({ updatePlannerTask() {} })
  vm.runInContext(source, context)
  const nodes = { '[data-action="connect"]': {}, '[data-action="disconnect"]': {}, '[data-planner-model]': {}, '.agent-id .state-label': { dataset: {} } }
  const card = { querySelector: selector => nodes[selector], querySelectorAll: () => [] }
  context.updateDynamicFields(card, { online: false, model: '<new-model>' })
  assert.equal(nodes['[data-action="connect"]'].hidden, false)
  assert.equal(nodes['[data-action="disconnect"]'].hidden, true)
  assert.equal(nodes['[data-planner-model]'].textContent, '<new-model>')
  assert.equal(nodes['.agent-id .state-label'].textContent, 'offline')
  context.updateDynamicFields(card, { online: true })
  assert.equal(nodes['[data-action="connect"]'].hidden, true)
  assert.equal(nodes['[data-action="disconnect"]'].hidden, false)
})
