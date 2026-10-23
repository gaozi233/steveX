export function taskStatusText(task) {
  if (!task) return 'No active task'
  const metrics = task.metrics
  return `${task.status} | ${task.calls}/${task.limits.maxCalls} calls | ${task.steps} commands | deadline ${new Date(task.deadlineAt).toLocaleTimeString()}${task.reason ? ' | ' + task.reason : ''}`
    + (metrics ? ` | model ${Math.round(metrics.modelMs)} ms, queue ${Math.round(metrics.queueMs)} ms, execute ${Math.round(metrics.executionMs)} ms, scheduling ${Math.round(metrics.schedulingWaitMs)} ms | repeated queries ${metrics.repeatedQueries} | reported usage ${JSON.stringify(metrics.usage)}; unreported calls ${metrics.unreportedUsageCalls}` : '')
    + (task.status === 'completed' ? ' | manually declared, environment not verified' : '')
}

export function updatePlannerTask(card, task) {
  const form = card.querySelector('form[data-action="message"]')
  if (!form) return
  form.dataset.taskId = task?.id || ''
  syncPlannerLimits(form)
  const fullStatus = taskStatusText(task)
  const status = form.querySelector('[data-planner-task]')
  status.textContent = task ? `${task.status} | ${task.calls}/${task.limits.maxCalls} calls | ${task.steps} commands${task.reason ? ' | ' + task.reason : ''}${task.status === 'completed' ? ' | manually declared, environment not verified' : ''}` : fullStatus
  const details = form.querySelector('[data-planner-details]')
  if (details) { details.textContent = fullStatus; details.parentElement.hidden = !task }
  const ended = !task || ['completed', 'cancelled', 'failed', 'budget_exhausted'].includes(task.status)
  form.querySelectorAll('[data-action="planner-control"], [data-action="planner-finish"]').forEach(button => {
    button.disabled = ended || (button.dataset.operation === 'continue' && task.status === 'running')
  })
}

export function syncPlannerLimits(form) {
  const disabled = !!form.dataset.taskId && form.elements.operation.value !== 'new'
  form.elements.maxCalls.disabled = disabled
  form.elements.maxSeconds.disabled = disabled
}
