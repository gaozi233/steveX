import { RouterError } from './domain/router.js'
import { HANDLER_IDS } from './handlers.js'

const PROVIDER_MODES = new Set(['stub', 'llm'])
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * 插件 Config 校验（设计文档 §17.5：部署可变项走 validated Config）。
 * 不引入 Schemastery，保持包零 DSH 依赖；非法配置在插件加载时直接抛错。
 */
export function normalizeConfig(raw = {}) {
  if (!isPlainObject(raw)) throw new RouterError('BAD_CONFIG', 'router config must be an object')

  const providerRaw = raw.provider ?? {}
  if (!isPlainObject(providerRaw)) throw new RouterError('BAD_CONFIG', 'config.provider must be an object')

  const mode = providerRaw.mode ?? 'stub'
  if (!PROVIDER_MODES.has(mode)) {
    throw new RouterError('BAD_CONFIG', `config.provider.mode must be stub or llm (got ${JSON.stringify(mode)})`)
  }
  if (providerRaw.stubSlots !== undefined && providerRaw.stubSlots !== null && !isPlainObject(providerRaw.stubSlots)) {
    throw new RouterError('BAD_CONFIG', 'config.provider.stubSlots must be an object (or null)')
  }
  if (providerRaw.fillSlots !== undefined && providerRaw.fillSlots !== null && typeof providerRaw.fillSlots !== 'function') {
    throw new RouterError('BAD_CONFIG', 'config.provider.fillSlots must be a function (programmatic use only)')
  }
  const promptsDir = providerRaw.promptsDir ?? raw.promptsDir ?? null
  if (promptsDir !== null && (typeof promptsDir !== 'string' || promptsDir === '')) {
    throw new RouterError('BAD_CONFIG', 'config.provider.promptsDir must be a non-empty string (or null)')
  }

  const confidenceThreshold = raw.confidenceThreshold ?? 0.7
  if (typeof confidenceThreshold !== 'number' || !Number.isFinite(confidenceThreshold)
    || confidenceThreshold < 0 || confidenceThreshold > 1) {
    throw new RouterError('BAD_CONFIG', 'config.confidenceThreshold must be a number in [0,1]')
  }

  const clarifyMaxTurns = raw.clarifyMaxTurns ?? 2
  if (!Number.isInteger(clarifyMaxTurns) || clarifyMaxTurns < 1) {
    throw new RouterError('BAD_CONFIG', 'config.clarifyMaxTurns must be an integer >= 1')
  }

  const enabledHandlers = raw.enabledHandlers ?? [...HANDLER_IDS]
  if (!Array.isArray(enabledHandlers) || enabledHandlers.length === 0) {
    throw new RouterError('BAD_CONFIG', 'config.enabledHandlers must be a non-empty array')
  }
  const seen = new Set()
  for (const id of enabledHandlers) {
    if (typeof id !== 'string' || !HANDLER_IDS.includes(id)) {
      throw new RouterError('BAD_CONFIG', `config.enabledHandlers has unknown handler ${JSON.stringify(id)}`)
    }
    if (seen.has(id)) throw new RouterError('BAD_CONFIG', `config.enabledHandlers has duplicate ${JSON.stringify(id)}`)
    seen.add(id)
  }

  const logger = raw.logger === undefined ? console : raw.logger
  if (logger !== null && (typeof logger !== 'object' || Array.isArray(logger))) {
    throw new RouterError('BAD_CONFIG', 'config.logger must be an object or null')
  }

  return {
    provider: {
      mode,
      stubSlots: providerRaw.stubSlots ?? null,
      fillSlots: providerRaw.fillSlots ?? null,
      promptsDir
    },
    confidenceThreshold,
    clarifyMaxTurns,
    enabledHandlers: [...enabledHandlers],
    logger
  }
}
