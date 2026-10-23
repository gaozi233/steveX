const api=require('../window_actions')
module.exports={name:'moveslot',usage:'moveslot <sourceSlot> <destSlot> [count]',
  description:'Move to a specified destination slot in current window/backpack; optional count moves exact items to empty/identical-component stack. Omitted count moves whole stack or swaps different items. No overflow, automatic dropping or item selection; reports changed slots',
  handler:api.action('moveslot',(bot,w,args,signal)=>api.move(bot,w,Number(args[0]),Number(args[1]),args[2]===undefined?undefined:Number(args[2]),signal))}
