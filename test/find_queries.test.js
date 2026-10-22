const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const findplayer = require('../src/commands/queries/findplayer')
const findblock = require('../src/commands/queries/findblock')

test('findplayer matches case-insensitive substrings, prioritizes exact names and never fabricates unloaded positions', async () => {
  const bot = { players: { far: { username: 'AlphaFar', ping: 0 }, near: { username: 'Alpha', entity: { position: new Vec3(-0.01, 64, 1.25) } } } }
  const result = await findplayer.handler(bot, ['ALPHA'])
  assert.deepEqual(result.players.map(p => p.name), ['Alpha', 'AlphaFar'])
  assert.deepEqual(result.players[0].position, { x: -0.01, y: 64, z: 1.25 })
  assert.match(result.output, /0.0 64.0 1.3/)
  assert.equal(result.players[1].loaded, false)
  assert.equal(Object.hasOwn(result.players[1], 'position'), false)
  assert.deepEqual((await findplayer.handler(bot, ['missing'])).players, [])
  assert.equal((await findplayer.handler(bot, [])).ok, false)
})

test('findblock validates full radius, supports namespaced names and air id zero, with a consistent block-grid origin', async () => {
  let options
  const bot = { version: '1.21.11', entity: { position: new Vec3(-0.01, 64, 1.25) },
    findBlock: input => { options = input; return { name: 'air', position: new Vec3(-1, 64, 1) } } }
  const result = await findblock.handler(bot, ['Minecraft:AIR', '1'], { bot })
  assert.equal(result.found, true); assert.equal(options.matching, 0)
  assert.deepEqual(options.point, new Vec3(-1, 64, 1)); assert.equal(result.distance, 0)
  for (const radius of ['0', '129', '1.5', '8abc', 'Infinity']) assert.equal((await findblock.handler(bot, ['stone', radius], { bot })).ok, false)
  assert.equal((await findblock.handler(bot, ['nonexistent'], { bot })).ok, false)
  bot.findBlock = () => null
  const missing = await findblock.handler(bot, ['stone'], { bot })
  assert.equal(missing.found, false); assert.equal(missing.radius, 32)
})
