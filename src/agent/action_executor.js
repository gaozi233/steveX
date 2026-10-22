function cancelled(reason = 'Action cancelled') {
  const error = new Error(String(reason?.message || reason))
  error.name = 'AbortError'
  return error
}

class ActionExecutor {
  constructor(onCancel = () => {}, limit = 32) {
    this.onCancel = onCancel
    this.limit = limit
    this.tasks = new Set()
    this.active = null
    this.closed = false
    this.tail = Promise.resolve()
  }

  run(name, operation, { signal, timeoutMs = 30000, source = 'manual' } = {}) {
    if (this.closed) return Promise.reject(cancelled('Agent is closed'))
    if (signal?.aborted) return Promise.reject(cancelled(signal.reason))
    if (this.tasks.size >= this.limit) return Promise.reject(new Error('Action queue is full'))
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('Invalid action timeout'))
    const controller = new AbortController()
    const task = { name, source, controller }
    const abort = () => controller.abort(cancelled(signal.reason))
    const interrupt = () => { if (this.active === task) this.onCancel() }
    signal?.addEventListener('abort', abort, { once: true })
    controller.signal.addEventListener('abort', interrupt, { once: true })
    this.tasks.add(task)
    const result = this.tail.then(async () => {
      controller.signal.throwIfAborted()
      this.active = task
      const timeout = setTimeout(() => controller.abort(Object.assign(cancelled(`Action ${name} timed out`), { code: 'ACTION_TIMEOUT' })), timeoutMs)
      try {
        const value = await operation(controller.signal)
        controller.signal.throwIfAborted()
        return value
      } finally {
        clearTimeout(timeout)
        this.active = null
      }
    }).finally(() => {
      signal?.removeEventListener('abort', abort)
      controller.signal.removeEventListener('abort', interrupt)
      this.tasks.delete(task)
    })
    // Do not race an uncooperative handler: its successor must wait for actual settlement.
    this.tail = result.catch(() => {})
    return result
  }

  cancelAll(reason = 'Actions stopped') {
    for (const task of this.tasks) task.controller.abort(cancelled(reason))
  }

  close() { this.closed = true; this.cancelAll('Agent closed') }
  getStatus() {
    return { closed: this.closed, pending: this.tasks.size,
      active: this.active ? { name: this.active.name, source: this.active.source, cancelling: this.active.controller.signal.aborted } : null }
  }
}

function sleep(ms, signal) {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); resolve() }
    const timer = setTimeout(finish, ms)
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(cancelled(signal.reason)) }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

module.exports = { ActionExecutor, cancelled, sleep }
