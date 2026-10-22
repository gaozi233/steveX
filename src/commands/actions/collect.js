/**
 * collect — pick up nearest dropped item
 */
const { goals: pathfinderGoals } = require('mineflayer-pathfinder')
const { sleep } = require('../../agent/action_executor')
const { operation, position, counts, inventoryChanges, syncInventory } = require('../operation_result')

module.exports = {
  name: 'collect',
  description: 'Approach nearest loaded item drop; succeeds only on own confirmed pickup, not just reaching it',
  usage: 'collect',
  handler: operation('collect', async (bot, args, agent, { signal } = {}) => {
    if (!agent.movements) return { ok: false, error: 'Pathfinder not ready' }

    const drop = Object.values(bot.entities).filter(e => e.name === 'item' && e.position)
      .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position) || a.id - b.id)[0]
    if (!drop) return { ok: false, error: 'No dropped items nearby' }
    await syncInventory(bot)
    const before = counts(bot), item = drop.getDroppedItem?.()
    const target = { entityId: drop.id, position: position(drop.position), ...(item ? { item: item.name, count: item.count } : {}) }

    let collected = false
    const onCollect = (collector, item) => { if (collector?.id === bot.entity.id && item?.id === drop.id) collected = true }
    bot.on('playerCollect', onCollect)
    try {
      await bot.pathfinder.goto(new pathfinderGoals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 0))
      for (let i = 0; i < 20 && !collected; i++) await sleep(100, signal)
      if (!collected) return { ok: false, error: 'Reached drop area but pickup was not confirmed (inventory full, item moved or unavailable)' }
      await syncInventory(bot)
      const changes = inventoryChanges(before, counts(bot))
      if (!changes.some(c => c.delta > 0)) return { ok: false, error: 'Pickup event received but inventory gain not confirmed', target, changes, evidence: ['server-collect-event'] }
      return { ok: true, confirmed: true, target, changes, evidence: ['server-collect-event','server-inventory-snapshot'], output: `Picked up: ${changes.filter(c => c.delta > 0).map(c => `${c.item} x${c.delta}`).join(', ')}`, entityId: drop.id }
    } finally { bot.removeListener('playerCollect', onCollect) }
  })
}
