import { createRouter } from './domain/router.js'
import { createTurnScope } from './domain/turn_scope.js'
import { defaultSlots } from './domain/slots.js'
import { createRouterProvider } from './provider.js'
import { createHandlers } from './handlers.js'
import { normalizeConfig } from './config.js'
import { loadPromptBlocks } from './prompts.js'

/**
 * steveX 路由插件（DSH / Cordis 适配层，设计文档 §17）。
 *
 * 这是本包**唯一**接触 DSH 的文件：
 *   - 把纯逻辑挂到 `ctx.router` 服务；
 *   - 监听 `agent/pre-step`（每个 step 触发，只在 step=1 填槽）；
 *   - 监听 `agent/turn-stopping`，统一清空 turn scope（§17.5.2）。
 *
 * 注册的提示词/工具/监听都由 Cordis 的作用域管理，插件卸载即回滚；
 * 回合级资源走 handler 上报的 turn scope，turn 结束无条件清空。
 *
 * 阶段 A：provider 用 stub、handler 全是桩；阶段 B 在此接入 agent.inject /
 * systemPrompt / tools 与真实内容（代码里标了 TODO）。
 */

export const name = 'stevex-router'
export const inject = []

export function apply(ctx, rawConfig = {}) {
  const config = normalizeConfig(rawConfig)
  const router = createRouter({ clarifyThreshold: config.confidenceThreshold })
  const provider = createRouterProvider(config.provider)
  const handlers = createHandlers({ enabled: config.enabledHandlers })

  for (const handler of handlers) router.registerHandler(handler)

  // llm 模式下先校验提示词内容；缺失/为空/仍带占位标记 = 拒绝上线。
  let prompts = null
  if (config.provider.mode === 'llm' && config.provider.promptsDir) {
    prompts = loadPromptBlocks(config.provider.promptsDir)
  }

  /** turn id → TurnScope */
  const scopes = new Map()
  /** turn id → 最近一次路由结果（调试/测试） */
  const pending = new Map()
  /** agent → 连续追问次数（追问上限在阶段 B 的话术里使用） */
  const clarifyCounts = new Map()

  const service = {
    registerHandler: router.registerHandler,
    decide: router.decide,
    run: router.run,
    handlerIds: router.handlerIds,
    turnScope: (turnId) => scopes.get(turnId) ?? null,
    lastResult: (turnId) => pending.get(turnId) ?? null
  }
  ctx.provide('router', service)

  function scopeFor(turnId) {
    let scope = scopes.get(turnId)
    if (!scope) {
      scope = createTurnScope({ label: `turn:${turnId}` })
      scopes.set(turnId, scope)
    }
    return scope
  }

  function agentKey(agent) {
    return agent?.session?.id ?? agent?.id ?? 'default'
  }

  function buildContext(payload, clarifyCount) {
    return {
      turn: scopeFor(payload.turn),
      turnId: payload.turn,
      agent: payload.agent,
      messages: payload.messages,
      clarifyCount,
      config,
      logger: config.logger,
      prompts
    }
  }

  async function route(payload) {
    const providerContext = {
      turn: payload.turn,
      step: payload.step,
      messages: payload.messages,
      agent: payload.agent,
      prompts
    }
    const slotJson = await provider.fillSlots(providerContext)

    const key = agentKey(payload.agent)
    const selected = router.decide(slotJson)
    let clarifyCount = clarifyCounts.get(key) ?? 0
    if (selected.exclusive) {
      clarifyCount += 1
      clarifyCounts.set(key, clarifyCount)
    } else {
      clarifyCounts.delete(key)
    }

    const result = await router.run(slotJson, buildContext(payload, clarifyCount))
    pending.set(payload.turn, { slotJson, ...result })

    const handlerIds = result.decision.order.join(',') || 'none'
    config.logger?.info?.(
      `[stevex-router] turn=${payload.turn} step=${payload.step} handlers=${handlerIds} `
      + `parts=${result.parts.length} errors=${result.errors.length} clarify=${clarifyCount}`
    )

    // TODO(stage B): 通过 agent.inject() / ctx.systemPrompt / ctx.tools 注入
    // 选中的提示词、工具与事实结果。阶段 A 只完成决策与回合级清理。
    return result
  }

  async function clarifyFallback(payload, error) {
    config.logger?.warn?.(
      `[stevex-router] routing failed: ${error?.message ?? String(error)}; falling back to clarify`
    )
    const fallback = defaultSlots()
    fallback.reason = `router failure: ${error?.message ?? String(error)}`
    fallback.clarification = '路由失败，请重试或换个说法。'
    clarifyCounts.set(agentKey(payload.agent), 1)
    const result = await router.run(fallback, buildContext(payload, 1))
    pending.set(payload.turn, { slotJson: fallback, ...result })
    return result
  }

  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    if (payload.signal?.aborted) return decision
    // agent/pre-step 每个 step 都会触发；只在本 turn 的第一个 step 填槽。
    if (payload.step !== 1) return decision

    try {
      await route(payload)
    } catch (error) {
      try {
        await clarifyFallback(payload, error)
      } catch (fallbackError) {
        config.logger?.warn?.(
          `[stevex-router] clarify fallback failed: ${fallbackError?.message ?? String(fallbackError)}`
        )
      }
    }
    return decision
  }, { prepend: true })

  ctx.on('agent/turn-stopping', async ({ turn }) => {
    const scope = scopes.get(turn)
    pending.delete(turn)
    if (!scope) return
    scopes.delete(turn)

    const { count, errors } = await scope.disposeAll()
    if (errors.length > 0) {
      config.logger?.warn?.(
        `[stevex-router] turn=${turn} turn scope disposed: ${count} disposer(s), ${errors.length} failure(s)`
      )
    } else {
      config.logger?.info?.(`[stevex-router] turn=${turn} turn scope disposed: ${count} disposer(s)`)
    }
  })

  // 插件卸载/热重载：兜底清空仍在内存里的 turn scope（正常路径由 turn-stopping 清）。
  ctx.effect(() => () => {
    const tasks = [...scopes.values()].map((scope) => scope.disposeAll())
    scopes.clear()
    pending.clear()
    clarifyCounts.clear()
    return Promise.all(tasks).then(() => undefined)
  })
}
