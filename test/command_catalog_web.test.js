const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

test('agent page omits command catalog but keeps inventory preview and command controls', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/web/public/pages/agents.js'), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const listeners = {}
  let previews = 0
  const context = vm.createContext({
    initInventoryPreview:()=>{previews++},
    initAgentInspector:()=>{}, inspectorHtml:()=>'<details class="agent-inspector"></details>',
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  })
  vm.runInContext(source, context)
  context.initAgents({ addEventListener: (event, handler) => { listeners[event] = handler } })
  assert.equal(previews, 1)
  assert.equal(typeof listeners.click, 'function')
  assert.equal(typeof listeners.submit, 'function')
  const html = vm.runInContext('agentCardHtml({name:"test", online:true})', context)
  assert.doesNotMatch(html, /Command Catalog|command-catalog/)
  assert.doesNotMatch(source, /\/api\/commands/)
  assert.match(html, /inventory-preview/)
  assert.match(html, /Send Command/)
  assert.match(html, /name="mode"/)
  assert.match(html, /value="once">One step/)
  assert.match(html, /planner-stop/)
  assert.match(html, /planner-result/)
  assert.doesNotMatch(source, /alert\('Coming soon'\)/)
})
