/**
 * v1 五个 handler（设计文档 §3 / §4.2）。
 *
 * 框架阶段全部是**桩**：只返回占位文本，不执行事实流/慢树生成。
 * 内容阶段（B）把 `run` 换成真实实现与 skill 提示词；接口不变。
 *
 * 注意：handler 的 `run` 不等于执行整个流程——它只负责准入与编排；
 * 事实/慢树的本体在各自能力服务里。
 */

export const HANDLER_IDS = Object.freeze(['fact', 'task', 'default', 'unsupported', 'clarify'])

const isMc = (slots) => slots.domain.value === 'minecraft'

export function createHandlers({ enabled = null } = {}) {
  const all = [
    {
      id: 'fact',
      match: (slots) => isMc(slots.slots) && slots.slots.knowledge.value === 'fact',
      provides: ['facts'],
      requires: [],
      onFailure: 'continue',
      priority: 10,
      run: async () => ({ text: '[stub] fact handler: 事实流内容待接入（阶段 B）' })
    },
    {
      id: 'task',
      match: (slots) => isMc(slots.slots) && slots.slots.action.value === 'execute',
      provides: [],
      requires: ['facts'], // 软依赖：事实 handler 也被选中时排在它后面
      onFailure: 'continue',
      priority: 30,
      run: async () => ({ text: '[stub] task handler: 慢树生成待接入（阶段 B）' })
    },
    {
      id: 'unsupported',
      match: (slots) => slots.slots.artifact.value !== 'none',
      provides: [],
      requires: [],
      onFailure: 'continue',
      priority: 20,
      run: async () => ({ text: '[stub] unsupported: 该能力暂不支持（不会执行任何写操作）' })
    },
    {
      id: 'clarify',
      match: () => false, // 由编排器在"需要追问"时独占选用
      provides: [],
      requires: [],
      onFailure: 'stop',
      priority: 0,
      run: async (slots, context) => ({
        text: slots.clarification
          ?? `[stub] clarify: 你是在问事实，还是要我去做？（第 ${context.clarifyCount ?? 1} 次追问）`
      })
    },
    {
      id: 'default',
      match: () => false, // 编排器兜底
      provides: [],
      requires: [],
      onFailure: 'stop',
      priority: 100,
      run: async () => ({ text: '[stub] default: 正常回答内容待接入（阶段 B）' })
    }
  ]

  const allowed = enabled === null ? HANDLER_IDS : enabled
  return all.filter((handler) => allowed.includes(handler.id))
}
