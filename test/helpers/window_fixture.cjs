const {isDeepStrictEqual}=require('node:util')
function fixture(start=27,type='minecraft:generic_9x3') {
  const w={id:1,type,inventoryStart:start,inventoryEnd:start+36,slots:Array(start+36).fill(null),selectedItem:null},calls=[]
  const same=(a,b)=>a&&b&&a.name===b.name&&isDeepStrictEqual(a.components,b.components)
  const bot={currentWindow:w,inventory:{slots:Array(46).fill(null),inventoryStart:9,inventoryEnd:45},_syncWindow:async()=>{},clickWindow:async(slot,button,mode)=>{
    calls.push([slot,button,mode])
    const item=w.slots[slot],held=w.selectedItem
    if(mode===1){
      if(!item)return
      const start=slot<w.inventoryStart?w.inventoryStart:0,end=slot<w.inventoryStart?w.inventoryEnd:w.inventoryStart
      const target=w.slots.findIndex((i,index)=>index>=start&&index<end&&!i)
      if(target>=0){w.slots[target]={...item,slot:target};w.slots[slot]=null}
    }else if(!held){
      if(!item)return
      const n=button===1?Math.ceil(item.count/2):item.count
      w.selectedItem={...item,count:n};w.slots[slot]=n===item.count?null:{...item,count:item.count-n}
    }else if(!item||same(item,held)){
      const n=Math.min(button===1?1:held.count,64-(item?.count||0))
      w.slots[slot]={...held,slot,count:(item?.count||0)+n}
      w.selectedItem=held.count===n?null:{...held,count:held.count-n}
    }else if(button===0){w.slots[slot]={...held,slot};w.selectedItem=item}
  }}
  function put(slot,name,count=1,components=[]){w.slots[slot]={name,type:name==='stone'?1:2,metadata:0,stackSize:64,slot,count,components}}
  return {bot,w,calls,put}
}
module.exports={fixture}
