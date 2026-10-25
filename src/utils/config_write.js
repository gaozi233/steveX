const fs = require('node:fs/promises')
const { randomUUID } = require('node:crypto')
function validateEnvironmentConfig(config) {
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  if(!object(config))return 'Config must be an object'
  for(const key of ['web','llm','brain','runtime','renderer','worldMap']){
    if(key in config && !object(config[key]))return `${key} must be an object`
  }
  if(config.web){
    if('port' in config.web && (!Number.isInteger(config.web.port)||config.web.port<1||config.web.port>65535))return 'web.port must be an integer in 1..65535'
    if('host' in config.web && (typeof config.web.host!=='string'||!config.web.host.trim()))return 'web.host must be a nonempty string'
  }
  for(const key of ['renderer','worldMap','brain'])if(config[key]&&'enabled' in config[key]&&typeof config[key].enabled!=='boolean')return `${key}.enabled must be boolean`
  if('agents' in config){
    if(!Array.isArray(config.agents))return 'agents must be an array'
    const names=new Set()
    for(const agent of config.agents){
      if(!object(agent)||typeof agent.name!=='string'||!agent.name.trim()||names.has(agent.name))return 'Each agent needs a unique nonempty name'
      names.add(agent.name)
      for(const key of ['minecraft','llm','brain','runtime','renderer'])if(key in agent&&!object(agent[key]))return `Agent ${key} must be an object`
      const mc=agent.minecraft
      if(mc&&'port' in mc&&(!Number.isInteger(mc.port)||mc.port<1||mc.port>65535))return 'Minecraft port must be an integer in 1..65535'
      if(mc)for(const key of ['host','username','version','auth'])if(key in mc&&(typeof mc[key]!=='string'||!mc[key].trim()))return `Minecraft ${key} must be a nonempty string`
    }
  }
  return null
}
async function writeEnvironmentConfig(file, raw, io=fs) {
  const temporary=file+'.'+randomUUID()+'.tmp'
  let handle
  try {
    handle=await io.open(temporary,'wx',0o600)
    await handle.writeFile(raw,'utf8');await handle.sync();await handle.close();handle=null
    await io.rename(temporary,file)
  } finally {
    try {await handle?.close()} finally {await io.unlink(temporary).catch(()=>{})}
  }
}
const KEEP_CREDENTIAL='[REDACTED: keep existing]'
const credential=key=>/^(api[_-]?key|password|secret|token|access[_-]?token|refresh[_-]?token|authorization)$/i.test(key)
function publicConfig(value) {
  if(Array.isArray(value))return value.map(publicConfig)
  if(!value||typeof value!=='object')return value
  return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,credential(key)&&v?KEEP_CREDENTIAL:publicConfig(v)]))
}
function restoreCredentials(value,previous={}) {
  if(Array.isArray(value))return value.map((v,i)=>restoreCredentials(v,v?.name?previous?.find?.(old=>old.name===v.name):previous?.[i]))
  if(!value||typeof value!=='object')return value
  const result=Object.create(null)
  for(const [key,v] of Object.entries(value)){
    if(credential(key)&&v===KEEP_CREDENTIAL){
      if(previous?.[key]===undefined)throw Error('Cannot retain a credential that does not exist')
      result[key]=previous[key]
    }else result[key]=restoreCredentials(v,previous?.[key])
  }
  for(const [key,v] of Object.entries(previous||{}))if(credential(key)&&!Object.hasOwn(value,key))result[key]=v
  return result
}
module.exports={validateEnvironmentConfig,writeEnvironmentConfig,publicConfig,restoreCredentials,KEEP_CREDENTIAL}
