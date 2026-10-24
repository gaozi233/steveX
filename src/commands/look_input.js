const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const valid = t => typeof t === 'string' && (t === '~' || number.test(t.startsWith('~') ? t.slice(1) : t)) && Number.isFinite(Number(t.startsWith('~') ? t.slice(1) || 0 : t))
function validateLook(args) {
  if (!Array.isArray(args) || typeof args[0] !== 'string' || !['angle','at','block'].includes(args[0].toLowerCase()) || args.length !== (args[0].toLowerCase() === 'angle' ? 3 : 4)) return 'Expected look angle <yaw> <pitch>, look at <x> <y> <z> or look block <x> <y> <z>'
  if (!args.slice(1).every(valid)) return 'Use finite decimal numbers or ~ offsets; ^ is unsupported'
  if (args[0].toLowerCase() === 'angle' && !args[2].startsWith('~') && Math.abs(Number(args[2])) > 90) return 'Absolute pitch must be -90..90 degrees'
  if (args.slice(1).some(t => Math.abs(Number(t.replace('~','') || 0)) > Number.MAX_SAFE_INTEGER)) return 'Value exceeds safe numeric range'
  if (args[0].toLowerCase()==='block' && !args.slice(1).every(t=>Number.isSafeInteger(Number(t.replace('~','')||0)))) return 'Block coordinates and offsets must be safe integers'
  return null
}
const resolve = (t, base) => t.startsWith('~') ? base + Number(t.slice(1) || 0) : Number(t)
const wrap = d => ((d + 180) % 360 + 360) % 360 - 180
module.exports = { validateLook, resolve, wrap }
