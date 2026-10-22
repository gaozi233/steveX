const test = require('node:test')
const assert = require('node:assert/strict')
const gamemode = require('../src/commands/queries/gamemode')
const xp = require('../src/commands/queries/xp')
const time = require('../src/commands/queries/time')
const weather = require('../src/commands/queries/weather')

test('gamemode recognizes all numeric and string modes, without inventing unknown values', async () => {
  for (const [index, mode] of ['survival', 'creative', 'adventure', 'spectator'].entries()) {
    assert.equal((await gamemode.handler({ game: { gameMode: index } })).mode, mode)
    assert.equal((await gamemode.handler({ game: { gameMode: mode.toUpperCase() } })).mode, mode)
  }
  assert.equal((await gamemode.handler({})).mode, null)
})

test('xp exposes only level and progress percentage, omitting total and raw progress', async () => {
  const result = await xp.handler({ experience: { level: 20, points: 15, progress: 0.25 } })
  assert.deepEqual(result, { ok: true, output: 'Level: 20 | Progress: 25.0%', level: 20, progressPercent: 25 })
  const unknown = await xp.handler({ experience: { progress: NaN } })
  assert.equal(unknown.progressPercent, null); assert.doesNotMatch(unknown.output, /NaN|Points|Total XP/)
})

test('time preserves zero values, frozen clock and unknowns', async () => {
  assert.deepEqual(await time.handler({ time: { timeOfDay: 0, day: 0, isDay: true, moonPhase: 0, doDaylightCycle: false } }), {
    ok: true, output: 'Time: 0 ticks | Day: 0 | day | Moon: full', timeOfDay: 0, day: 0, isDay: true, moonPhase: 0, doDaylightCycle: false
  })
  assert.equal((await time.handler({})).isDay, null)
  assert.match((await time.handler({})).output, /\| \? \|/)
})

test('weather distinguishes clear rain and thunder, while retaining transition strengths', async () => {
  assert.equal((await weather.handler({ isRaining: false, rainState: 0, thunderState: 0 })).weather, 'clear')
  assert.equal((await weather.handler({ isRaining: true, rainState: 1, thunderState: 0 })).weather, 'raining')
  const storm = await weather.handler({ isRaining: true, rainState: 1, thunderState: 0.25 })
  assert.equal(storm.weather, 'thunder'); assert.equal(storm.thunderStrength, 0.25)
  assert.equal((await weather.handler({})).weather, null)
})
