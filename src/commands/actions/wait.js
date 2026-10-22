/**
 * wait <ticks> — wait for a number of game ticks
 */
module.exports = {
  name: 'wait',
  description: 'Wait for a number of game ticks',
  usage: 'wait <ticks>',
  async handler(bot, args, agent, { signal } = {}) {
    if (args.length < 1) return { ok: false, error: 'Usage: wait <ticks>' }
    const ticks = args.length === 1 && /^\d+$/.test(args[0]) ? Number(args[0]) : NaN
    if (!Number.isSafeInteger(ticks) || ticks < 1) return { ok: false, error: 'Tick count must be a positive safe integer' }
    signal?.throwIfAborted()
    await new Promise((resolve, reject) => {
      let remaining = ticks
      const cleanup = () => { bot.removeListener('physicsTick', tick); bot.removeListener('end', ended); signal?.removeEventListener('abort', abort) }
      const tick = () => { if (--remaining <= 0) { cleanup(); resolve() } }
      const ended = () => { cleanup(); reject(new Error('Agent disconnected while waiting')) }
      const abort = () => { cleanup(); reject(signal.reason) }
      bot.on('physicsTick', tick)
      bot.once('end', ended)
      signal?.addEventListener('abort', abort, { once: true })
    })
    return { ok: true, output: `Waited ${ticks} ticks` }
  }
}
