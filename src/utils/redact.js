// Defense-in-depth for diagnostics, not a general personal-data anonymizer.
function redact(text, secrets = []) {
  let value = typeof text === 'string' ? text : String(text ?? '')
  for (const secret of secrets) if (typeof secret === 'string' && secret.length >= 4) value = value.split(secret).join('[REDACTED]')
  return value.replace(/\bsk-(?:or-v1-)?[a-zA-Z0-9_-]{16,}/g, '[REDACTED]')
    .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|password|authorization|access[_-]?token)["']?\s*[:=]\s*["']?)[^\s"',}\]]+/gi, '$1[REDACTED]')
}
module.exports = { redact }
