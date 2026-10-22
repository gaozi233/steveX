const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const operations = new Set(['dig', 'mine', 'collect', 'craft', 'place', 'placeentity'])
const queries = new Set('pos hp hunger oxygen inventory nearby gamemode xp time weather window findplayer findblock recipes'.split(' '))
const finite = value => decimal.test(value) && Number.isFinite(Number(value))
const coordinate = value => finite(value) && Math.abs(Number(value)) <= Number.MAX_SAFE_INTEGER
const integer = (min, max = Number.MAX_SAFE_INTEGER) => value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max
const registryName = value => /^(?:minecraft:)?[a-z0-9_]+$/i.test(value)
const field = (name, check, expected, values) => ({ name, check, expected, values })
const enumField = (name, values) => field(name, value => values.includes(value.toLowerCase()), values.join(' | '), values)
const coords = () => ['x','y','z'].map(name => field(name, coordinate, 'finite decimal coordinate within safe numeric range'))
const contracts = Object.fromEntries('pos hp hunger oxygen inventory gamemode xp time weather window jump stand stop stopdig dig collect place placeentity'.split(' ').map(name => [name, { usage:name, min:0, fields:[] }]))
Object.assign(contracts, {
  nearby: { usage:'nearby [type|name|all] [radius]', min:0, fields:[field('filter',()=>true,'entity type/name/all'),field('radius',integer(1,128),'integer 1..128')] },
  findplayer: { usage:'findplayer <name>', min:1, fields:[field('name',()=>true,'one player-name fragment')] },
  findblock: { usage:'findblock <blockName> [radius]', min:1, fields:[field('blockName',registryName,'exact registry name, optional minecraft: prefix'),field('radius',integer(1,128),'integer 1..128')] },
  recipes: { usage:'recipes <itemName>', min:1, fields:[field('itemName',registryName,'exact registry name, optional minecraft: prefix')] },
  look: { usage:'look <yaw> <pitch>', min:2, fields:[field('yaw',finite,'finite decimal radians'),field('pitch',v=>finite(v)&&Math.abs(Number(v))<=Math.PI/2,'finite radians -PI/2..PI/2')] },
  lookat: { usage:'lookat <x> <y> <z>', min:3, fields:coords() },
  goto: { usage:'goto <x> <y> <z>', min:3, fields:coords() },
  mine: { usage:'mine <x> <y> <z>', min:3, fields:['x','y','z'].map(name=>field(name,v=>coordinate(v)&&Number.isSafeInteger(Number(v)),'safe integer block coordinate')) },
  move: { usage:'move <forward|back|left|right|sprint|sneak> [durationMs]', min:1, fields:[enumField('control',['forward','back','left','right','sprint','sneak']),field('durationMs',integer(1,30000),'integer milliseconds 1..30000')] },
  swing: { usage:'swing [hand]', min:0, fields:[enumField('hand',['right','left'])] },
  follow: { usage:'follow <playerName>', min:1, fields:[field('playerName',()=>true,'one exact player name')] },
  wait: { usage:'wait <ticks>', min:1, fields:[field('ticks',integer(1),'positive safe integer physics ticks')] },
  craft: { usage:'craft <itemName> [times] [auto|hand|table] [recipeIndex]', min:1, fields:[field('itemName',registryName,'exact registry name, optional minecraft: prefix'),field('times',integer(1,64),'integer recipe executions 1..64'),enumField('station',['auto','hand','table']),field('recipeIndex',v=>/^[1-9]\d*$/.test(v)&&Number.isSafeInteger(Number(v)),'positive safe integer catalog index')] }
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
    ...(operations.has(name) ? { action:name, status:'failed', confirmed:false, target:null, changes:[], evidence:[] } : {}),
    ...(name === 'craft' ? { phase:'preflight', effect:'none', completedExecutions:0, producedCount:0 } : {}) })
}
function validateArguments(name, args) {
  const spec = contracts[name]
  if (!spec) return null
  if (!Array.isArray(args) || args.length < spec.min || args.length > spec.fields.length) return invalid(name, `Expected ${spec.min === spec.fields.length ? spec.min : spec.min + '..' + spec.fields.length} arguments`)
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
    const normalized = args.map((value,i)=>contracts[name].fields[i].values ? value.toLowerCase() : value)
    try { return normalizeFailure(name,await handler.call(this,bot,normalized,agent,options)) }
    catch (error) { return exceptionFailure(name,error,options.signal) }
  }
  guarded[wrapped] = true
  return guarded
}
module.exports = { contracts, validateArguments, normalizeFailure, exceptionFailure, withContract }
