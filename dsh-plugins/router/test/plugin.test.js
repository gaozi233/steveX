import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { apply, name } from '../src/index.js'
import { loadPromptBlocks } from '../src/prompts.js'
import { createFakeContext, emitEvent, emitWaterfall, makeSlots } from './helpers.js'

const promptsDir = fileURLToPath(new URL('../prompts', import.meta.url))

function payload(turn, step) {
  return {
    agent: { id: 'agent-1' },
    messages: [],
    turn,
    step,
    signal: { aborted: false }
  }
}

const enter = async () => ({ kind: 'enter', messages: [] })

async function preStep(ctx, turn, step) {
  return emitWaterfall(ctx, 'agent/pre-step', payload(turn, step), enter)
}

async function turnStopping(ctx, turn) {
  return emitEvent(ctx, 'agent/turn-stopping', { turn })
}

test('插件加载：服务与五个 handler 就位', () => {
  const ctx = createFakeContext()
  apply(ctx, { logger: null })

  assert.equal(name, 'stevex-router')
  assert.ok(ctx.router)
  assert.deepEqual(
    ctx.router.handlerIds().sort(),
    ['clarify', 'default', 'fact', 'task', 'unsupported']
  )
})

test('pre-step：step=1 路由并创建 turn scope；step=2 不重复填槽', async () => {
  const calls = []
  const ctx = createFakeContext()
  apply(ctx, {
    logger: null,
    provider: {
      mode: 'llm',
      fillSlots: async () => {
        calls.push(1)
        return makeSlots({ knowledge: 'fact' })
      }
    }
  })

  await preStep(ctx, 1, 1)
  assert.equal(calls.length, 1)
  assert.deepEqual(ctx.router.lastResult(1).decision.order, ['fact'])
  assert.ok(ctx.router.turnScope(1))

  await preStep(ctx, 1, 2) // 工具结果驱动的后续 step
  assert.equal(calls.length, 1)
  await turnStopping(ctx, 1)
  assert.equal(ctx.router.turnScope(1), null)

  await preStep(ctx, 2, 1)
  assert.equal(calls.length, 2)
})

test('turn-stopping：无条件清空 handler 注册的回合级 disposer', async () => {
  const ctx = createFakeContext()
  apply(ctx, { logger: null })

  let disposed = 0
  ctx.router.registerHandler({
    id: 'probe',
    match: () => true,
    priority: 1,
    run: (slots, context) => {
      context.turn.onDispose(() => { disposed += 1 })
      return { text: 'probe' }
    }
  })

  await preStep(ctx, 1, 1)
  assert.ok(ctx.router.lastResult(1).decision.order.includes('probe'))
  assert.equal(disposed, 0)

  await turnStopping(ctx, 1)
  assert.equal(disposed, 1)
  assert.equal(ctx.router.turnScope(1), null)
})

test('追问：unknown → clarify 独占', async () => {
  const ctx = createFakeContext()
  apply(ctx, {
    logger: null,
    provider: { mode: 'stub', stubSlots: makeSlots({ knowledge: 'unknown' }) }
  })

  await preStep(ctx, 1, 1)
  const result = ctx.router.lastResult(1)
  assert.equal(result.decision.exclusive, true)
  assert.deepEqual(result.decision.order, ['clarify'])
  assert.match(result.parts[0].result.text, /clarify/)
})

test('provider 失败 → 追问兜底，不抛出', async () => {
  const ctx = createFakeContext()
  apply(ctx, {
    logger: null,
    provider: {
      mode: 'llm',
      fillSlots: async () => { throw new Error('provider boom') }
    }
  })

  await preStep(ctx, 1, 1)
  const result = ctx.router.lastResult(1)
  assert.equal(result.decision.exclusive, true)
  assert.deepEqual(result.decision.order, ['clarify'])
})

test('配置校验：非法值在插件加载时失败', () => {
  assert.throws(() => apply(createFakeContext(), { confidenceThreshold: 2 }), /confidenceThreshold/)
  assert.throws(() => apply(createFakeContext(), { enabledHandlers: [] }), /enabledHandlers/)
  assert.throws(() => apply(createFakeContext(), { enabledHandlers: ['nope'] }), /enabledHandlers/)
  assert.throws(
    () => apply(createFakeContext(), { provider: { mode: 'llm' } }),
    /fillSlots/
  )
})

test('llm 模式的提示词占位必须拒绝上线', () => {
  assert.throws(
    () => apply(createFakeContext(), {
      logger: null,
      provider: {
        mode: 'llm',
        fillSlots: async () => makeSlots(),
        promptsDir
      }
    }),
    (e) => e.code === 'PROMPT_PLACEHOLDER'
  )
  assert.throws(() => loadPromptBlocks(''), (e) => e.code === 'MISSING_PROMPTS_DIR')
})

test('插件卸载：兜底清空未结束的 turn scope', async () => {
  const ctx = createFakeContext()
  apply(ctx, { logger: null })

  let disposed = 0
  ctx.router.registerHandler({
    id: 'probe',
    match: () => true,
    priority: 1,
    run: (slots, context) => {
      context.turn.onDispose(() => { disposed += 1 })
      return { text: 'probe' }
    }
  })

  await preStep(ctx, 1, 1)
  await ctx.dispose()
  assert.equal(disposed, 1)
  assert.equal(ctx.router.lastResult(1), null)
})
