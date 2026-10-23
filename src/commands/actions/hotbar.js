const { inventoryAction } = require('../inventory_actions')
module.exports = {
  name: 'hotbar',
  description: 'Select a quick bar slot (0-8)',
  usage: 'hotbar <slot>',
  handler: inventoryAction('hotbar',async(bot,args)=>{
    const slot=Number(args[0])
    bot.setQuickBarSlot(slot)
    return {target:{quickBarSlot:slot},output:`Selected quick bar slot ${slot}`,verify:()=>bot.quickBarSlot===slot}
  })
}
