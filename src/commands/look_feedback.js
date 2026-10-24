const { aimedBlock, aimedEntity, controlBaseShapes } = require('./rightclick_helpers')
function crosshairFeedback(bot) {
  if (!bot.entity?.position || !bot.world?.raycast) return {crosshair:null,raycastAvailable:false}
  const eye=bot.entity.position.offset(0,bot.entity.eyeHeight??bot.entity.height,0)
  const block=aimedBlock(bot), entity=aimedEntity(bot,block)
  if(entity) return {raycastAvailable:true,crosshair:{type:'entity',id:entity.entity.id,name:entity.entity.name,
    position:entity.entity.position,hitPoint:entity.point,distance:eye.distanceTo(entity.point)}}
  return {raycastAvailable:true,crosshair:block?{type:'block',name:block.name,position:block.position,
    hitPoint:block.intersect,face:block.face,distance:eye.distanceTo(block.intersect)}:null}
}
function blockAim(block) {
  // Prismarine supplies collision boxes, not a complete vanilla outline registry.
  // Buttons have exact state-dependent outline boxes in the shared click helper.
  const shapes=controlBaseShapes(block)
  if (!shapes?.length) return null
  const box=shapes[0]
  return {point:block.position.offset((box[0]+box[3])/2,(box[1]+box[4])/2,(box[2]+box[5])/2),
    shapeSource:block.name.endsWith('_button')?'button-selection-shape':block.name==='lever'?'lever-mounting-base':'registry-collision-shape',shapeIndex:0}
}
module.exports={crosshairFeedback,blockAim}
