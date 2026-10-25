function selectEntity(bot, token, { fromEyes = false } = {}) {
  const origin=fromEyes?bot.entity.position.offset(0,bot.entity.eyeHeight||1.62,0):bot.entity.position
  const name = e => (e.username || e.name || '').toLowerCase()
  const matches = Object.values(bot.entities || {}).filter(e => e.id !== bot.entity.id && e.position &&
    (/^\d+$/.test(token) ? String(e.id) === token : name(e).includes(token.toLowerCase())))
  matches.sort((a,b) => (name(b) === token.toLowerCase()) - (name(a) === token.toLowerCase()) ||
    origin.distanceTo(a.position) - origin.distanceTo(b.position) || a.id-b.id)
  return matches[0]
}
function aimPoint(entity) { return entity.position.offset(0, Math.min((entity.height || 1)/2, 1), 0) }
function checkReach(bot, entity, reach) {
  const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0), point = aimPoint(entity)
  const distance = eye.distanceTo(point)
  if (bot.entities[entity.id] !== entity) return {ok:false,errorCode:'TARGET_CHANGED',error:'Target disappeared'}
  if (distance > reach) return {ok:false,errorCode:'ENTITY_OUT_OF_REACH',error:`Target beyond ${reach} blocks; move closer`}
  if (!bot.world?.raycast) return {ok:false,errorCode:'INTERACTION_UNAVAILABLE',error:'Line-of-sight check unavailable'}
  if (distance > 0.05 && bot.world.raycast(eye,point.minus(eye).scaled(1/distance),distance-0.05))
    return {ok:false,errorCode:'ENTITY_OBSTRUCTED',error:'Target is obstructed'}
  return null
}
module.exports = {selectEntity,aimPoint,checkReach}
