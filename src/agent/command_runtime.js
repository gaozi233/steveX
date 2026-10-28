const { randomUUID } = require('node:crypto')
const { cancelled } = require('./action_executor')

// Lifecycle tracking does not own action arbitration: handlers still use ActionExecutor.
class CommandRuntime {
  constructor(execute, { historyLimit = 100, pendingLimit = 128 } = {}) {
    this.execute = execute
    this.historyLimit = historyLimit
    this.pendingLimit = pendingLimit
    this.records = new Map()
    this.pending = new Map()
    this.closed = false
  }

  submit(command, options = {}) {
    if (this.closed) throw cancelled('Agent is closed')
    options.signal?.throwIfAborted()
    // Emergency controls must remain reachable even when ordinary submissions are full.
    const interrupt = typeof command === 'string' && /^(?:stop|dig\s+stop)$/i.test(command.trim())
    if (this.pending.size >= this.pendingLimit && !interrupt) throw new Error('Command runtime is full')
    const callId = randomUUID(), controller = new AbortController()
    const record = { callId, command: typeof command === 'string' ? command.slice(0, 4096) : '[non-string input]', source: options.source || 'manual',
      llmRequestId: options.llmRequestId || null, contextId: options.contextId || null,
      taskId: options.taskId || null, nodeId: options.nodeId || null,
      status: 'queued', submittedAt: Date.now(), startedAt: null, finishedAt: null }
    this.records.set(callId, record)
    this.pending.set(callId, controller)
    const abort = () => this.cancel(callId, options.signal.reason)
    options.signal?.addEventListener('abort', abort, { once: true })
    let work
    try {
      work = this.execute(command, { ...options, callId, signal: controller.signal,
        onRuntimeStarted: () => {
          record.startedAt = Date.now()
          if (!controller.signal.aborted) record.status = 'running'
        } })
    } catch (error) { work = Promise.reject(error) }
    const result = Promise.resolve(work).then(value => {
      record.status = controller.signal.aborted || value?.cancelled ? 'cancelled' : value?.ok === false ? 'failed' : value?.status === 'RUNNING' ? 'dispatched' : 'returned'
      record.errorCode = value?.errorCode || null
      return value
    }, error => {
      record.status = controller.signal.aborted || error.name === 'AbortError' ? 'cancelled' : 'failed'
      record.error = String(error.message).slice(0, 1024)
      throw error
    }).finally(() => {
      record.finishedAt = Date.now()
      options.signal?.removeEventListener('abort', abort)
      this.pending.delete(callId)
      const settled = [...this.records.values()].filter(item => item.finishedAt !== null)
      for (const item of settled.slice(0, Math.max(0, settled.length - this.historyLimit))) this.records.delete(item.callId)
    })
    // Detached submissions can be inspected through their handle without unhandled rejections.
    result.catch(() => {})
    return { callId, result, cancel: reason => this.cancel(callId, reason), snapshot: () => this.get(callId) }
  }

  get(callId) {
    const record = this.records.get(callId)
    return record ? { ...record } : null
  }

  cancel(callId, reason = 'Command cancelled') {
    const controller = this.pending.get(callId)
    if (!controller || controller.signal.aborted) return false
    this.records.get(callId).status = 'cancelling'
    controller.abort(cancelled(reason))
    return true
  }

  close() {
    this.closed = true
    for (const callId of this.pending.keys()) this.cancel(callId, 'Agent closed')
  }
}

module.exports = { CommandRuntime }
