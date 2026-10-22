function foodState(bot) {
  const finite = value => typeof value === 'number' && Number.isFinite(value)
  return { food: finite(bot?.food) ? bot.food : null,
    saturation: finite(bot?.foodSaturation) ? bot.foodSaturation : null,
    saturationSource: finite(bot?.foodSaturation) ? 'last-update-health-packet' : null }
}

module.exports = { foodState }
