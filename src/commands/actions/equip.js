const { inventoryAction,findItem,sameItem,variantCount,compactItemView } = require('../inventory_actions')
module.exports = {
  name: 'equip',
  description: 'Equip the first exact-name backpack/quickbar item to hand (default) or an equipment slot; confirms item identity, never chooses optimal gear',
  usage: 'equip <itemName> [hand|head|torso|legs|feet|off-hand]',
  handler: inventoryAction('equip',async(bot,args)=>{
    const item=findItem(bot,args[0]);if(item.ok===false)return item
    const destination=args[1]||'hand',selected=compactItemView(item),before=variantCount(bot,item)
    await bot.equip(item,destination)
    return {target:{destination,item:selected},output:`Equipped ${item.name} to ${destination}`,verify:()=>!bot.inventory.selectedItem && sameItem(destination==='hand'?bot.heldItem:bot.inventory.slots[bot.getEquipmentDestSlot(destination)],item) && variantCount(bot,item)===before}
  })
}
