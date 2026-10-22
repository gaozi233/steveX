async function protectedApproach(bot, movements, goal, signal) {
  signal?.throwIfAborted()
  const previous = { canDig: movements.canDig, allow1by1towers: movements.allow1by1towers, scafoldingBlocks: movements.scafoldingBlocks }
  const stop = () => bot.pathfinder.setGoal(null)
  try {
    movements.canDig = false
    movements.allow1by1towers = false
    movements.scafoldingBlocks = []
    bot.pathfinder.setMovements(movements)
    signal?.addEventListener('abort', stop, { once: true })
    signal?.throwIfAborted()
    await bot.pathfinder.goto(goal)
    signal?.throwIfAborted()
    if (typeof goal.isEnd === 'function' && !goal.isEnd(bot.entity.position.floored())) throw Object.assign(new Error('No path reached the requested approach position'), { name: 'NoPath' })
  } finally {
    signal?.removeEventListener('abort', stop)
    // goto can resolve an empty path without clearing its goal. Clear it before
    // re-enabling digging, or physicsTick can resume that goal destructively.
    stop()
    Object.assign(movements, previous)
    bot.pathfinder.setMovements(movements)
  }
}
module.exports = { protectedApproach }
