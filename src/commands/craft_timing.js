function craftTimeoutMs(args) {
  const raw = args[1] ?? '1'
  const times = /^\d+$/.test(raw) ? Number(raw) : NaN
  if (!Number.isInteger(times) || times < 1 || times > 64) return 30000
  // Keep a finite watchdog while allowing the documented 64-execution batch.
  return 30000 + (times - 1) * 1000
}

module.exports = { craftTimeoutMs }
