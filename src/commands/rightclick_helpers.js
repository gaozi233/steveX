const { counts } = require('./operation_result')
const {RaycastIterator}=require('prismarine-world').iterators
function placementCounts(bot) {
  const totals=counts(bot),offhand=bot.inventory?.slots?.[45]
  if(offhand)totals.set(offhand.name,(totals.get(offhand.name)||0)+offhand.count)
  return totals
}
const windows = new Set('chest trapped_chest ender_chest barrel hopper dispenser dropper furnace blast_furnace smoker crafting_table enchanting_table anvil chipped_anvil damaged_anvil brewing_stand beacon grindstone cartography_table smithing_table loom stonecutter'.split(' '))
function opensWindow(block) { return windows.has(block.name)||block.name.endsWith('shulker_box') }
function interactive(block) {
  return opensWindow(block)||/(?:_door|_trapdoor|_fence_gate|_button|_bed)$/.test(block.name)||['lever','bell','note_block','repeater','comparator','daylight_detector','respawn_anchor','lectern','jukebox','chiseled_bookshelf','decorated_pot','composter','cake'].includes(block.name)
}
function airUse(bot,item) {
  return !!item && (!!bot.registry.foodsByName?.[item.name]||['bow','crossbow','shield','trident','fishing_rod','ender_pearl','snowball','egg','potion','splash_potion','lingering_potion','spyglass','glass_bottle','bucket'].includes(item.name)||item.name.endsWith('_bucket'))
}
function blockClick(bot,block,hand) {
  if(!bot.supportFeature('blockPlaceHasInsideBlock'))throw Error('Precise block click requires the modern block-place protocol')
  if(!block.intersect||!Number.isInteger(block.face))throw Error('Aimed block hit point unavailable')
  const delta=block.intersect.minus(block.position)
  bot._client.write('block_place',{location:block.position,direction:block.face,hand:hand==='off-hand'?1:0,cursorX:delta.x,cursorY:delta.y,cursorZ:delta.z,insideBlock:false,sequence:0,worldBorderHit:false})
}
// Collision data omits controls with no collision. Select only their small
// mounting base, not an invented full-cube hitbox or the whole lever handle.
function controlBaseShapes(block) {
  const button=block.name.endsWith('_button')
  if(block.name!=='lever'&&!button)return block.shapes
  const p=block.getProperties(),depth=button?(p.powered?1:2):3
  let box
  if(p.face==='floor'||p.face==='ceiling'){
    const alongX=p.facing==='east'||p.facing==='west',a=button?6:4
    box=alongX?[a,0,5,16-a,depth,11]:[5,0,a,11,depth,16-a]
    if(p.face==='ceiling'){box[1]=16-depth;box[4]=16}
  }else{
    const low=button?6:4,high=16-low
    if(p.facing==='north')box=[5,low,16-depth,11,high,16]
    else if(p.facing==='south')box=[5,low,0,11,high,depth]
    else if(p.facing==='west')box=[16-depth,low,5,16,high,11]
    else box=[0,low,5,depth,high,11]
  }
  return [box.map(n=>n/16)]
}
function aimedBlock(bot) {
  if(!bot.world?.raycast)return bot.blockAtCursor(4.5)
  const self=bot.entity,eye=self.position.offset(0,self.eyeHeight??self.height,0),{Vec3}=require('vec3')
  const direction=new Vec3(-Math.sin(self.yaw)*Math.cos(self.pitch),Math.sin(self.pitch),-Math.cos(self.yaw)*Math.cos(self.pitch))
  return bot.world.raycast(eye,direction,4.5,(block,ray)=>{
    const hit=ray.intersect(controlBaseShapes(block)||[],block.position)
    if(!hit)return false
    block.face=hit.face;block.intersect=hit.pos;return true
  })
}
function aimedEntity(bot,block) {
  const self=bot.entity,eye=self.position.offset(0,self.eyeHeight??self.height,0)
  const {Vec3}=require('vec3'),direction=new Vec3(-Math.sin(self.yaw)*Math.cos(self.pitch),Math.sin(self.pitch),-Math.cos(self.yaw)*Math.cos(self.pitch))
  const limit=Math.min(4.5,block?.intersect?.distanceTo(eye)??4.5),ray=new RaycastIterator(eye,direction,limit)
  let selected=null,distance=limit
  for(const e of Object.values(bot.entities||{})){
    if(e.id===self.id||!e.position||!Number.isFinite(e.width)||!Number.isFinite(e.height)||['item','experience_orb','arrow','spectral_arrow','snowball','egg','potion','firework_rocket'].includes(e.name))continue
    const half=e.width/2,hit=ray.intersect([[-half,0,-half,half,e.height,half]],e.position)
    if(hit&&eye.distanceTo(hit.pos)<distance){distance=eye.distanceTo(hit.pos);selected={entity:e,point:hit.pos}}
  }
  return selected
}
module.exports={placementCounts,opensWindow,interactive,airUse,blockClick,aimedEntity,aimedBlock,controlBaseShapes}
