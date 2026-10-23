const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm')
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/web/public/lib/planner-controls.js'), 'utf8').replace(/^export /gm, '')
test('planner UI preserves task identity, gates ended tasks and limits editing to new tasks', () => {
  const context = vm.createContext({}); vm.runInContext(source, context)
  const controls = [{ dataset: { operation: 'continue' } }, { dataset: { operation: 'pause' } }, { dataset: {} }]
  const status = {}, form = { dataset: {}, elements: { operation: { value: 'append' }, maxCalls: {}, maxSeconds: {} },
    querySelector: selector => selector === '[data-planner-task]' ? status : null, querySelectorAll: () => controls }
  const card = { querySelector: () => form }
  const task = { id: 'a', status: 'paused', calls: 1, steps: 1, limits: { maxCalls: 5 }, deadlineAt: 100000 }
  context.updatePlannerTask(card, task)
  assert.equal(form.dataset.taskId, 'a'); assert.equal(controls[0].disabled, false)
  assert.equal(form.elements.maxCalls.disabled, true)
  form.elements.operation.value = 'new'; context.syncPlannerLimits(form)
  assert.equal(form.elements.maxCalls.disabled, false)
  context.updatePlannerTask(card, { ...task, status: 'running' }); assert.equal(controls[0].disabled, true)
  context.updatePlannerTask(card, { ...task, status: 'completed' })
  assert.ok(controls.every(button => button.disabled))
  assert.match(status.textContent, /manually declared, environment not verified/)
  context.updatePlannerTask(card, null)
  assert.equal(status.textContent, 'No active task'); assert.equal(form.dataset.taskId, '')
})
