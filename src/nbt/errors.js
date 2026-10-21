'use strict'

/**
 * 查询 API 的统一错误（docs/nbt查询api设计方案.md §7）。
 *
 * code 取值：
 *   LOAD_ERROR      参数 / 白名单不合法（对应文档里的"装载错误"）
 *   SOURCE_MISSING  数据源不存在 / 不可读
 *   SOURCE_CORRUPT  解析失败（半截写、损坏、结构不符合记录集）
 *   SOURCE_UNSTABLE 读盘期间被刷盘改写；重读一次仍不稳定（§5.1 读一致性）
 *   TIMEOUT         超出查询预算（§3.4 / §4.5）
 */
class QueryError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'QueryError'
    this.code = code
    if (options.cause) this.cause = options.cause
  }
}

module.exports = { QueryError }
