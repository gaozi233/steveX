function steerVehicle(bot, control) {
  const left = control === 'left' ? 1 : control === 'right' ? -1 : 0
  const forward = control === 'forward' ? 1 : control === 'back' ? -1 : 0
  if (bot.supportFeature?.('newPlayerInputPacket')) {
    bot._client.write('player_input', { inputs: {
      forward: forward > 0, backward: forward < 0, left: left > 0, right: left < 0,
      shift: !!bot.getControlState?.('sneak'), jump: false, sprint: false
    } })
  } else {
    // Upstream moveVehicle sets the legacy jump flag even for neutral input.
    bot._client.write('steer_vehicle', { sideways: left, forward, jump: 0 })
  }
}
module.exports = { steerVehicle }
