const { randomUUID } = require('node:crypto')

const defaults = { maxCalls: 32, maxDurationMs: 300000, maxConsecutiveFailures: 3 }
const maxima = { maxCalls: 1000, maxDurationMs: 3600000, maxConsecutiveFailures: 20 }
function taskLimits(overrides = {}, base = defaults) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('Task limits must be an object')
  const result = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(maxima, key) || !Number.isInteger(value) || value < 1 || value > maxima[key]) throw new Error(`Invalid task limit: ${key}`)
    result[key] = value
  }
  return result
}

function createTask(goal, limits) {
  const createdAt = Date.now()
  return { id: randomUUID(), goal, limits, createdAt, deadlineAt: createdAt + limits.maxDurationMs,
    status: 'ready', reason: null, mode: 'once', revision: 0, messages: [], queries: new Map(),
    calls: 0, steps: 0, consecutiveFailures: 0, completionVerification: 'not_verified',
    metrics: { modelMs: 0, commandMs: 0, queueMs: 0, executionMs: 0, schedulingWaitMs: 0,
      repeatedQueries: 0, invalidReplies: 0, failedCommands: 0, reportedUsageCalls: 0, usage: {} } }
}

function taskSnapshot(task) {
  if (!task) return null
  const { queries, messages, ...snapshot } = task
  return { ...snapshot, messageCount: messages.length, limits: { ...task.limits },
    metrics: { ...task.metrics, usage: { ...task.metrics.usage }, unreportedUsageCalls: task.calls - task.metrics.reportedUsageCalls } }
}

module.exports = { taskLimits, createTask, taskSnapshot }
