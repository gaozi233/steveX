// Retain reported counts only; missing usage must not look like a free call.
function modelUsage(usage) {
  if (!usage || typeof usage !== 'object') return null
  const result = {}
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_cache_hit_tokens', 'prompt_cache_miss_tokens']) {
    if (Number.isInteger(usage[key]) && usage[key] >= 0) result[key] = usage[key]
  }
  return Object.keys(result).length ? result : null
}
module.exports = { modelUsage }
