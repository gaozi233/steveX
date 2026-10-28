const { randomUUID } = require('node:crypto')
const { modelUsage } = require('../llm/usage')
const { cancelled } = require('./action_executor')

// A planner request produces an intent, never an executable side effect.
class CommandPlanner {
  constructor(llm, bus, identity, pickCommand) {
    this.llm = llm
    this.bus = bus
    this.identity = identity
    this.pickCommand = pickCommand
    this.pending = null
  }

  request(messages, { signal, taskId = null, revision = null, step = null, trigger = 'explicit_request' } = {}) {
    if (this.pending) throw new Error('Planner request is still settling')
    signal?.throwIfAborted()
    if (!this.llm.apiKey) throw new Error('LLM disabled: missing API key')
    const controller = new AbortController()
    const trace = { ...this.identity, requestId: randomUUID(), contextId: randomUUID(),
      model: this.llm.model, taskId, revision, step, trigger }
    // Freeze the submitted context by value, not by a caller-owned message array.
    const context = JSON.parse(JSON.stringify(messages))
    const record = { ...trace, status: 'pending', submittedAt: Date.now(), finishedAt: null }
    const emit = (phase, data) => this.bus.emit('agent:llm:' + phase, { ...trace, ...data, timestamp: Date.now() })
    const abort = () => {
      record.status = 'cancelling'
      controller.abort(cancelled(signal.reason))
    }
    signal?.addEventListener('abort', abort, { once: true })
    let usage = null
    const started = performance.now()
    const handle = { requestId: trace.requestId, snapshot: () => ({ ...record }), cancel: reason => {
      if (record.finishedAt !== null || controller.signal.aborted) return false
      record.status = 'cancelling'
      controller.abort(cancelled(reason || 'Decision cancelled'))
      return true
    } }
    this.pending = handle
    handle.result = Promise.resolve().then(async () => {
      controller.signal.throwIfAborted()
      emit('input', { input: context.at(-1)?.content || '', prompt: context.at(-1)?.content || '', messages: context })
      const output = await this.llm.chat(context, { signal: controller.signal, onUsage: value => { usage = modelUsage(value) } })
      controller.signal.throwIfAborted()
      const command = this.pickCommand(output)
      record.status = command ? 'proposed' : 'invalid'
      emit('output', { output, response: output, command, usage, modelMs: performance.now() - started })
      return { ...trace, kind: 'command', command, output, status: record.status, usage, modelMs: performance.now() - started }
    }).catch(error => {
      record.status = controller.signal.aborted ? 'cancelled' : 'failed'
      emit('error', { cancelled: controller.signal.aborted, error: error.message, usage, modelMs: performance.now() - started })
      throw error
    }).finally(() => {
      record.finishedAt = Date.now()
      record.usage = usage
      record.modelMs = performance.now() - started
      signal?.removeEventListener('abort', abort)
      if (this.pending === handle) this.pending = null
    })
    handle.result.catch(() => {})
    return handle
  }

  cancel(reason) { return this.pending?.cancel(reason) || false }
}

module.exports = { CommandPlanner }
