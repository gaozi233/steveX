const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const operations = new Set(['dig', 'collect', 'craft', 'rightclick'])
const effectCommands = new Set([...operations, 'equip', 'hotbar', 'unequip', 'drop'])
const queries = new Set('pos hp hunger oxygen inventory nearby gamemode xp time weather window findplayer findblock recipes'.split(' '))
const finite = value => decimal.test(value) && Number.isFinite(Number(value))
const coordinate = value => finite(value) && Math.abs(Number(value)) <= Number.MAX_SAFE_INTEGER
const integer = (min, max = Number.MAX_SAFE_INTEGER) => value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max
const registryName = value => /^(?:minecraft:)?[a-z0-9_]+$/i.test(value)
const field = (name, check, expected, values) => ({ name, check, expected, values })
const enumField = (name, values) => field(name, value => values.includes(value.toLowerCase()), values.join(' | '), values)
const coords = () => ['x','y','z'].map(name => field(name, coordinate, 'finite decimal coordinate within safe numeric range'))
const contracts = Object.fromEntries('pos hp hunger oxygen inventory gamemode xp time weather window jump stand stop collect'.split(' ').map(name => [name, { usage:name, min:0, fields:[] }]))
Object.assign(contracts, {
  jump: {usage:'jump [normal|glide]',min:0,fields:[enumField('mode',['normal','glide'])]},
  sneak: {usage:'sneak <on|off|tap>',min:1,fields:[enumField('mode',['on','off','tap'])]},
  rightclick: {usage:'rightclick [hand|off-hand]',min:0,fields:[enumField('hand',['hand','off-hand'])]},
  dig: {usage:'dig [stop|<x> <y> <z>]',min:0,fields:['x','y','z'].map(name=>field(name,v=>coordinate(v)&&Number.isSafeInteger(Number(v)),'safe integer block coordinate'))},
  interactentity: {usage:'interactentity <entityName|id> [normal|at]',min:1,fields:[field('target',()=>true,'one entity name fragment or numeric entity id'),enumField('mode',['normal','at'])]},
  nearby: { usage:'nearby [type|name|all] [radius]', min:0, fields:[field('filter',()=>true,'entity type/name/all'),field('radius',integer(1,128),'integer 1..128')] },
  findplayer: { usage:'findplayer <name>', min:1, fields:[field('name',()=>true,'one player-name fragment')] },
  findblock: { usage:'findblock <blockName> [radius]', min:1, fields:[field('blockName',registryName,'exact registry name, optional minecraft: prefix'),field('radius',integer(1,128),'integer 1..128')] },
  recipes: { usage:'recipes <itemName>', min:1, fields:[field('itemName',registryName,'exact registry name, optional minecraft: prefix')] },
  look: { usage:'look <yaw> <pitch>', min:2, fields:[field('yaw',finite,'finite decimal radians'),field('pitch',v=>finite(v)&&Math.abs(Number(v))<=Math.PI/2,'finite radians -PI/2..PI/2')] },
  lookat: { usage:'lookat <x> <y> <z>', min:3, fields:coords() },
  goto: { usage:'goto <x> <y> <z>', min:3, fields:coords() },
  move: { usage:'move <forward|back|left|right|sprint> [durationMs]', min:1, fields:[enumField('control',['forward','back','left','right','sprint']),field('durationMs',integer(1,30000),'integer milliseconds 1..30000')] },
  swing: { usage:'swing [hand]', min:0, fields:[enumField('hand',['right','left'])] },
  follow: { usage:'follow <playerName>', min:1, fields:[field('playerName',()=>true,'one exact player name')] },
  wait: { usage:'wait <ticks>', min:1, fields:[field('ticks',integer(1),'positive safe integer physics ticks')] },
  craft: { usage:'craft <itemName> [times] [auto|hand|table] [recipeIndex]', min:1, fields:[field('itemName',registryName,'exact registry name, optional minecraft: prefix'),field('times',integer(1,64),'integer recipe executions 1..64'),enumField('station',['auto','hand','table']),field('recipeIndex',v=>/^[1-9]\d*$/.test(v)&&Number.isSafeInteger(Number(v)),'positive safe integer catalog index')] },
  equip: { usage:'equip <itemName> [hand|head|torso|legs|feet|off-hand]', min:1, fields:[field('itemName',registryName,'exact registry name, optional minecraft: prefix'),enumField('destination',['hand','head','torso','legs','feet','off-hand'])] },
  hotbar: { usage:'hotbar <slot>', min:1, fields:[field('slot',integer(0,8),'integer quickbar index 0..8')] },
  unequip: { usage:'unequip [hand|head|torso|legs|feet|off-hand]', min:0, fields:[enumField('destination',['hand','head','torso','legs','feet','off-hand'])] },
  rightdown: {usage:'rightdown [hand|off-hand]',min:0,fields:[enumField('hand',['hand','off-hand'])]}, rightup: {usage:'rightup',min:0,fields:[]},
  drop: {usage:'drop <itemName> [count]',min:1,fields:[field('itemName',registryName,'exact registry name, optional minecraft: prefix'),field('count',integer(1),'positive safe integer count')]},
})

function normalizeFailure(name, value) {
  if (!contracts[name] || value?.ok !== false) return value
  const errorCode = value.errorCode || (value.cancelled ? 'CANCELLED' : queries.has(name) ? 'QUERY_FAILED' : 'ACTION_FAILED')
  const prefix = `[${errorCode}] `
  const oldError = typeof value.error === 'string' && value.error ? value.error : 'Command did not complete'
  const reason = oldError.startsWith(prefix) ? oldError.slice(prefix.length) : oldError
  const error = prefix + reason
  const oldOutput = typeof value.output === 'string' ? value.output : ''
  const text = oldOutput.startsWith(prefix) ? oldOutput.slice(prefix.length) : oldOutput
  // Keep partial effects and detailed recipe feedback verbatim, visible to Brain.
  const output = text ? `${prefix}${text}${!text.includes(reason) ? '\n' + reason : ''}` : error
  return { ...value, errorCode, error, output }
}
function invalid(name, message, argument) {
  const spec = contracts[name], error = `${message}. Usage: ${spec.usage}`
  return normalizeFailure(name, { ok:false, errorCode:'INVALID_ARGUMENTS', error, usage:spec.usage, ...(argument ? { argument } : {}),
    ...(effectCommands.has(name) ? { action:name, status:'failed', confirmed:false, target:null, changes:[], evidence:[] } : {}),
    ...(name === 'craft' ? { phase:'preflight', effect:'none', completedExecutions:0, producedCount:0 } : {}) })
}
function validateArguments(name, args) {
  const spec = contracts[name]
  if (!spec) return null
  if (!Array.isArray(args) || args.length < spec.min || args.length > spec.fields.length) return invalid(name, `Expected ${spec.min === spec.fields.length ? spec.min : spec.min + '..' + spec.fields.length} arguments`)
  if (name === 'dig') {
    if (args.length === 1 && typeof args[0] === 'string' && args[0].toLowerCase() === 'stop') return null
    if (args.length !== 0 && args.length !== 3) return invalid(name, 'Expected no arguments, stop, or three integer coordinates')
  }
  for (let i=0;i<args.length;i++) {
    const f = spec.fields[i], value = args[i]
    if (typeof value !== 'string' || !value || /\s/.test(value) || !f.check(value)) return invalid(name, `${f.name} must be ${f.expected}`, f.name)
  }
  return null
}
function exceptionFailure(name, error, signal) {
  const cancelled = error?.name === 'AbortError' || signal?.aborted === true
  const code = signal?.reason?.code || error?.code
  const errorCode = code === 'ACTION_TIMEOUT' ? code : cancelled ? 'CANCELLED' : ({NoPath:'PATH_NOT_FOUND',Timeout:'PATH_TIMEOUT',GoalChanged:'PATH_INTERRUPTED',PathStopped:'PATH_INTERRUPTED',Disconnected:'DISCONNECTED'})[error?.name]
  return normalizeFailure(name, { ok:false, cancelled, errorCode, error:error?.message || String(error) })
}
const wrapped = Symbol('command-contract')
function withContract(name, handler) {
  if (!contracts[name] || handler[wrapped]) return handler
  const guarded = async function (bot, args = [], agent, options = {}) {
    const failure = validateArguments(name,args)
    if (failure) return failure
    const normalized = name === 'dig' && args.length === 1 ? ['stop'] : args.map((value,i)=>contracts[name].fields[i].values ? value.toLowerCase() : value)
    try { return normalizeFailure(name,await handler.call(this,bot,normalized,agent,options)) }
    catch (error) { return exceptionFailure(name,error,options.signal) }
  }
  guarded[wrapped] = true
  return guarded
}
module.exports = { contracts, effectCommands, validateArguments, normalizeFailure, exceptionFailure, withContract }
