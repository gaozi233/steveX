/**
 * 回合作用域（设计文档 §17.5.2）：handler 把本轮资源注册进来，
 * 由编排器在 turn 结束**无条件**统一释放。
 *
 * 语义：
 *   - LIFO（后注册先释放）；
 *   - 每个 disposer 单独 try/catch，一个失败不影响其余；
 *   - 重复清理幂等；
 *   - 不依赖具体 DSH 事件，纯逻辑。
 */
export class TurnScope {
  #stack = []
  #disposed = false

  constructor({ label = 'turn' } = {}) {
    this.label = label
  }

  get size() {
    return this.#stack.length
  }

  get disposed() {
    return this.#disposed
  }

  /**
   * 注册一个本轮结束时要执行的清理函数。
   * @param {() => void | Promise<void>} disposer
   * @returns {() => void | Promise<void>} 同一个 disposer（便于测试）
   */
  onDispose(disposer) {
    if (typeof disposer !== 'function') throw new TypeError('turn scope: onDispose expects a function')
    if (this.#disposed) throw new Error(`turn scope ${this.label} is already disposed`)
    this.#stack.push(disposer)
    return disposer
  }

  /**
   * 清空本回合的全部 disposer。
   * @returns {Promise<{ count: number, errors: Error[] }>} 重复调用返回 count=0
   */
  async disposeAll() {
    if (this.#disposed) return { count: 0, errors: [] }
    this.#disposed = true

    let count = 0
    const errors = []
    while (this.#stack.length > 0) {
      const disposer = this.#stack.pop()
      count += 1
      try {
        await disposer()
      } catch (error) {
        errors.push(error)
      }
    }
    return { count, errors }
  }
}

export function createTurnScope(options) {
  return new TurnScope(options)
}
