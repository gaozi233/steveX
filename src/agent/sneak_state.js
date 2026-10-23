const states = new WeakMap()

function stateFor(bot) {
  let state = states.get(bot)
  if (state) return state
  const original = bot.setControlState
  state = { held: false, original }
  // Pathfinder and clearControlStates also use this setter. A persistent user
  // hold must not flicker off during their ordinary movement cleanup.
  const setter = function (control, value) {
    if (control === 'sneak' && value === false && state.held) return
    return original.call(bot, control, value)
  }
  state.setter = setter
  states.set(bot, state)
  bot.setControlState = setter
  bot.once?.('end', () => {
    state.held = false
    if (bot.setControlState === setter) bot.setControlState = original
    states.delete(bot)
  })
  return state
}

function setSneakHold(bot, held) {
  const state = stateFor(bot)
  state.held = held
  try { bot.setControlState('sneak', held) }
  catch (error) { state.held = false; throw error }
}
function clearSneakHold(bot) {
  const state = states.get(bot)
  if (state) state.held = false
}
function isSneakHeld(bot) { return states.get(bot)?.held === true }

module.exports = { setSneakHold, clearSneakHold, isSneakHeld }
