const {isDeepStrictEqual}=require('node:util')
function formatCommandResult(result) {
  if(!result||typeof result!=='object')return JSON.stringify({ok:false,errorCode:'INVALID_RESULT',error:'Command returned no result'})
  const {output,...data}=result
  let duplicate=false
  if(typeof output==='string')try{
    const parsed=JSON.parse(output)
    duplicate=parsed!==null&&typeof parsed==='object'&&!Array.isArray(parsed)&&
      Object.keys(parsed).every(key=>Object.hasOwn(data,key)&&isDeepStrictEqual(data[key],parsed[key]))
  }catch{}
  if(typeof output==='string'&&output&&!duplicate&&output!==data.error)data.message=output
  return JSON.stringify(data,(_,value)=>typeof value==='bigint'?value.toString():value)
}
module.exports={formatCommandResult}
