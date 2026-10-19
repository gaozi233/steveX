import test from 'node:test'
import assert from 'node:assert/strict'

import { createTurnScope } from '../src/domain/turn_scope.js'

test('LIFO：后注册先释放（支持 async disposer）', async () => {
  const order = []
  const scope = createTurnScope({ label: 'lifo' })
  scope.onDispose(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
    order.push('first')
  })
  scope.onDispose(() => order.push('second'))

  const { count, errors } = await scope.disposeAll()
  assert.equal(count, 2)
  assert.equal(errors.length, 0)
  assert.deepEqual(order, ['second', 'first'])
  assert.equal(scope.size, 0)
  assert.equal(scope.disposed, true)
})

test('单个 disposer 失败不影响其余，错误被收集', async () => {
  const order = []
  const scope = createTurnScope()
  scope.onDispose(() => order.push('a'))
  scope.onDispose(() => { throw new Error('boom') })
  scope.onDispose(() => order.push('c'))

  const { count, errors } = await scope.disposeAll()
  assert.equal(count, 3)
  assert.equal(errors.length, 1)
  assert.equal(errors[0].message, 'boom')
  assert.deepEqual(order, ['c', 'a'])
})

test('重复清理幂等', async () => {
  const scope = createTurnScope()
  let calls = 0
  scope.onDispose(() => { calls += 1 })

  const first = await scope.disposeAll()
  const second = await scope.disposeAll()
  assert.equal(first.count, 1)
  assert.equal(second.count, 0)
  assert.deepEqual(second.errors, [])
  assert.equal(calls, 1)
})

test('dispose 之后不能再注册', async () => {
  const scope = createTurnScope()
  await scope.disposeAll()
  assert.throws(() => scope.onDispose(() => {}), /already disposed/)
})

test('onDispose 拒绝非函数', () => {
  const scope = createTurnScope()
  assert.throws(() => scope.onDispose(null), TypeError)
})
