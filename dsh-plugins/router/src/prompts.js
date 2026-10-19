import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { RouterError } from './domain/router.js'

/**
 * 提示词内容加载（设计文档 §6 / §16）。
 *
 * 内容层未填充时（文件缺失、为空、或仍带 TODO 标记），llm 模式必须**拒绝上线**，
 * 不允许静默使用空提示词。
 */
export const PLACEHOLDER_MARKER = 'TODO(内容层)'

export const PROMPT_FILES = Object.freeze({
  slotDefs: 'router/slot_defs.md',
  rules: 'router/rules.md',
  fewShot: 'router/few_shot.md',
  fact: 'handlers/fact.md',
  task: 'handlers/task.md',
  default: 'handlers/default.md',
  unsupported: 'handlers/unsupported.md',
  clarify: 'handlers/clarify.md'
})

export function loadPromptBlocks(dir) {
  if (typeof dir !== 'string' || dir === '') {
    throw new RouterError('MISSING_PROMPTS_DIR', 'router: promptsDir is required when prompt content is loaded')
  }

  const blocks = {}
  for (const [key, relative] of Object.entries(PROMPT_FILES)) {
    const file = join(dir, relative)
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      throw new RouterError('PROMPT_MISSING', `router: prompt file missing: ${file}`)
    }
    if (text.trim() === '') {
      throw new RouterError('PROMPT_EMPTY', `router: prompt file is empty: ${file}`)
    }
    if (text.includes(PLACEHOLDER_MARKER)) {
      throw new RouterError('PROMPT_PLACEHOLDER', `router: prompt content is not filled yet: ${file}`)
    }
    blocks[key] = text
  }
  return blocks
}
