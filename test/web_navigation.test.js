const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const read = file => fs.readFileSync(path.join(__dirname, '../src/web/public', file), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')

test('returning from Configs clears its editor before rendering agents and restores toolbar', () => {
  const list = { children: [], replaceChildren() { this.children = [] } }, controls = {}, elements = {}
  const context = vm.createContext({
    document: { getElementById: id => id === 'agents-list' ? list : (elements[id] ||= { style: {} }),
      querySelector: selector => selector === 'section.controls' ? controls : null, querySelectorAll: () => [] },
    renderConfigs: container => { container.children = ['config editor'] },
    renderAgents: container => { assert.deepEqual(container.children, []); container.children.push('agent') }
  })
  const source = read('app.js')
  vm.runInContext(source.slice(0, source.indexOf("\ndocument.querySelectorAll('.nav-item')")), context)
  context.showConfigsPage()
  assert.equal(controls.hidden, true)
  context.showAgentsPage()
  assert.equal(controls.hidden, false)
  assert.deepEqual(list.children, ['agent'])
})

test('config load ignores stale responses from replaced or detached editors', async () => {
  const requests = [], context = vm.createContext({ fetchEnvConfig: () => new Promise(resolve => requests.push(resolve)) })
  vm.runInContext(read('pages/configs.js'), context)
  const first = { value: '', isConnected: true }, second = { value: '', isConnected: true }, status = {}
  context.first = first; context.second = second; context.status = status
  vm.runInContext('editorEl = first; statusEl = status', context)
  const pending1 = context.loadConfig()
  vm.runInContext('editorEl = second', context)
  const pending2 = context.loadConfig()
  requests[1]({ config: { current: true } }); await pending2
  requests[0]({ config: { obsolete: true } }); await pending1
  assert.match(second.value, /current/); assert.equal(first.value, '')
  const pending3 = context.loadConfig(); second.isConnected = false
  requests[2]({ config: { detached: true } }); await pending3
  assert.doesNotMatch(second.value, /detached/)
})
