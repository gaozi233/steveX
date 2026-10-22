const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

test('web catalog loads on expansion, escapes data and never dispatches a command', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/web/public/pages/agents.js'), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const listeners = {}, content = {}, details = { open: true, dataset: {}, matches: s => s === '.command-catalog', querySelector: () => content }
  let requests = 0
  const context = vm.createContext({
    fetch: async url => { requests++; assert.equal(url, '/api/commands'); return { ok: true, json: async () => ({ ok: true, categories: [{ title: '<group>', note: '<note>', commands: [{ usage: 'move <forward>', kind: 'action', description: '<script>' }] }] }) } },
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  })
  vm.runInContext(source, context)
  context.initAgents({ addEventListener: (event, handler) => { listeners[event] = handler } })
  await listeners.toggle({ target: details })
  assert.match(content.innerHTML, /move &lt;forward&gt;/)
  assert.match(content.innerHTML, /&lt;script&gt;/)
  assert.doesNotMatch(content.innerHTML, /<script>/)
  await listeners.toggle({ target: details })
  assert.equal(requests, 1)
})
