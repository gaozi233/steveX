const { resolve, wrap } = require('../look_input')
const { Vec3 } = require('vec3')
module.exports = {
  name: 'look',
  description: 'Turn once without moving/tracking. angle: Minecraft degrees, yaw 0 south/+Z, 90 west/-X, -90 east/+X, 180 north/-Z; positive pitch looks down. ~ angles offset current view; ~ coordinates offset feet world position at execution. Relative pitch clamps to -90..90. at aims from eyes; no legacy radians or ^ coordinates',
  usage: 'look angle <yaw> <pitch> | look at <x> <y> <z>',
  async handler(bot, args) {
    if (args[0] === 'angle') {
      const yaw = wrap(resolve(args[1], 180 - bot.entity?.yaw * 180 / Math.PI))
      const pitch = Math.max(-90, Math.min(90, resolve(args[2], -bot.entity?.pitch * 180 / Math.PI)))
      if (![yaw,pitch].every(Number.isFinite)) return { ok:false, errorCode:'STATE_UNAVAILABLE', error:'Current rotation unavailable' }
      await bot.look(Math.PI - yaw * Math.PI / 180, -pitch * Math.PI / 180, true)
      return { ok:true, yaw,pitch, angleUnit:'degrees', output:`Look angle yaw=${yaw} pitch=${pitch} degrees (Minecraft)` }
    }
    const values = args.slice(1).map((t,i)=>resolve(t,bot.entity?.position?.[['x','y','z'][i]]))
    if (!values.every(v=>Number.isFinite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER)) return {ok:false,errorCode:'INVALID_ARGUMENTS',error:'Resolved target exceeds safe coordinate range'}
    const target = new Vec3(...values)
    await bot.lookAt(target)
    return {ok:true,target:{x:target.x,y:target.y,z:target.z},output:`Look at ${values.join(' ')} (world coordinates)`}
  }
}
module.exports.handler = require('../command_contract').withContract(module.exports.name, module.exports.handler)
