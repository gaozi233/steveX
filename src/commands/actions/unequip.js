const { inventoryAction,failure,sameItem,variantCount,compactItemView } = require('../inventory_actions')
module.exports = {
  name: 'unequip',
  description: 'Unequip an item from a slot',
  usage: 'unequip [hand|head|torso|legs|feet|off-hand]',
  handler: inventoryAction('unequip',async(bot,args)=>{
    const destination = args[0] || 'hand'
    const source=destination==='hand'?bot.heldItem:bot.inventory.slots[bot.getEquipmentDestSlot(destination)]
    if(!source)return {target:{destination},output:`${destination} is already empty`,verify:()=>true}
    const selected=compactItemView(source),before=variantCount(bot,source),slots=bot.inventory.slots.slice(9,45)
    if(destination==='hand'){
      if(!slots.some(i=>!i))return failure('INVENTORY_FULL','No empty backpack/quickbar slot; refusing to drop the held item to unequip')
    }else{
      const room=slots.reduce((n,i)=>n+(!i?source.stackSize:sameItem(i,source)?Math.max(0,source.stackSize-i.count):0),0)
      if(room<source.count)return failure('INVENTORY_FULL','Not enough backpack capacity to unequip without dropping items')
    }
    await bot.unequip(destination)
    return {target:{destination,item:selected},output:`Unequipped ${destination} without dropping items`,verify:()=>!bot.inventory.selectedItem && !(destination==='hand'?bot.heldItem:bot.inventory.slots[bot.getEquipmentDestSlot(destination)]) && variantCount(bot,source)===before}
  })
}
