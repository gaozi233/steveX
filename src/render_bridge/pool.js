class RenderQueue {
  constructor(limit = 32) {
    this.limit = limit
    this.pending = 0
    this.tail = Promise.resolve()
    this.closed = false
  }
  run(operation) {
    if (this.closed) return Promise.reject(new Error('Render queue is closed'))
    if (this.pending >= this.limit) return Promise.reject(new Error('Render queue is full'))
    this.pending++
    const next = this.tail.then(() => {
      if (this.closed) throw new Error('Render queue is closed')
      return operation()
    })
    this.tail = next.catch(() => {}).finally(() => { this.pending-- })
    return next
  }
  close() { this.closed = true }
}

module.exports = { RenderQueue }
