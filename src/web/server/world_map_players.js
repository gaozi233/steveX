const fs = require('node:fs/promises')
const path = require('node:path')

const skinNames = ['alex','ari','efe','kai','makena','noor','steve','sunny','zuri']
function defaultSkin(uuid) {
  const hex=uuid.replaceAll('-','')
  let hash=0
  for(let i=0;i<32;i+=8) hash ^= parseInt(hex.slice(i,i+8),16)
  const index=((hash%18)+18)%18
  return {skinUrl:`assets/bluemap-player-models/skins/${index<9?'slim':'wide'}/${skinNames[index%9]}.png`,slim:index<9}
}

function appearance(item, bot) {
  if(!item?.name || !/^[a-z0-9_]+$/.test(item.name)) return null
  const asset=/^(leather|chainmail|iron|golden|diamond|netherite|copper|turtle)_/.exec(item.name)?.[1]
  return {id:'minecraft:'+item.name,asset:asset==='golden'?'gold':asset==='turtle'?'turtle_scute':asset,
    count:item.count||1,isBlock:Boolean(bot.registry?.blocksByName?.[item.name]),enchanted:false}
}

// Appearance only: no inventory contents, task state, or credentials leave the runtime.
function modelPlayers(manager, dimension, mapId, previous=new WeakMap(), now=Date.now()) {
  return livePlayers(manager,dimension).players.map(player=>{
    const agent=[...manager.agents.values()].find(a=>a.bot?.entity?.uuid===player.uuid || a.bot?.player?.uuid===player.uuid)
    const bot=agent.bot, slots=bot.inventory?.slots||[], last=previous.get(bot)
    previous.set(bot,{...player.position,at:now})
    const distance=last?Math.hypot(player.position.x-last.x,player.position.z-last.z):0
    let skin=defaultSkin(player.uuid)
    const supplied=bot.players?.[player.name]?.skinData
    try {
      const url=new URL(supplied?.url)
      if(url.hostname==='textures.minecraft.net' && /^\/texture\/[a-f0-9]+$/i.test(url.pathname) && !url.username && !url.password) {
        skin={skinUrl:'https://textures.minecraft.net'+url.pathname,slim:supplied.model==='slim'}
      }
    } catch {}
    return {uuid:player.uuid,name:player.name,...player.position,...skin,
      yaw:player.rotation.yaw,headYaw:player.rotation.yaw,pitch:player.rotation.pitch,
      moving:Boolean(last && now-last.at<=2500 && distance>0.02 && distance<8),
      crouching:Boolean(bot.getControlState?.('sneak')),maps:[mapId],dimension,
      equipment:Object.fromEntries(Object.entries({head:slots[5],chest:slots[6],legs:slots[7],feet:slots[8],
        mainHand:bot.heldItem,offHand:slots[45]}).map(([key,item])=>[key,appearance(item,bot)])),
      observedAt:now,source:'mineflayer-client'}
  })
}

function livePlayers(manager, dimension = 'minecraft:overworld') {
  const normal = value => String(value).replace(/^minecraft:/, '')
  const players = []
  for (const agent of manager.agents.values()) {
    const bot = agent.bot, entity = bot?.entity
    if (!agent.isOnline() || !entity || normal(bot.game?.dimension) !== normal(dimension)) continue
    const uuid = entity.uuid || bot.player?.uuid, p = entity.position
    if (!/^[a-f0-9-]{36}$/i.test(uuid || '') || !p || ![p.x,p.y,p.z,entity.yaw,entity.pitch].every(Number.isFinite)) continue
    players.push({uuid, name:agent.getUsername(), foreign:false,
      position:{x:p.x,y:p.y,z:p.z},rotation:{pitch:-entity.pitch*180/Math.PI,yaw:180-entity.yaw*180/Math.PI,roll:0}})
  }
  return {players}
}

// Optional, one-way human map output. Never feeds coordinates back into an agent.
function createWorldMapPublisher(manager, warn) {
  const config = manager.config?.worldMap
  if (!config?.enabled || !config.playersFile) return { close:async()=>{} }
  const file=path.resolve(config.playersFile)
  if (path.basename(file) !== 'players.json') throw Error('worldMap.playersFile must end in players.json')
  const temporary=file+'.stevex-part', dimension=config.dimension || 'minecraft:overworld'
  const modelsFile=config.modelsFile && path.resolve(config.modelsFile), previous=new WeakMap()
  if(modelsFile && (path.basename(modelsFile)!=='players.json' || modelsFile===file)) throw Error('worldMap.modelsFile must be a separate players.json')
  let closed=false, pending=false, tail=Promise.resolve()
  const write = data => {
    tail=tail.then(async()=>{
      await fs.mkdir(path.dirname(file),{recursive:true})
      await fs.writeFile(temporary,JSON.stringify(data))
      await fs.rename(temporary,file)
      if(modelsFile) {
        const models=closed || !manager.config?.worldMap?.enabled ? [] : modelPlayers(manager,dimension,config.mapId||'natural',previous)
        await fs.mkdir(path.dirname(modelsFile),{recursive:true})
        await fs.writeFile(modelsFile+'.stevex-part',JSON.stringify(models))
        await fs.rename(modelsFile+'.stevex-part',modelsFile)
      }
    }).catch(error=>warn('[web] World player markers: '+error.message))
    return tail
  }
  const tick=()=>{
    if(closed || pending)return
    pending=true
    return write(manager.config?.worldMap?.enabled ? livePlayers(manager,dimension) : {players:[]}).finally(()=>{pending=false})
  }
  return {tick,close:async()=>{if(closed)return;closed=true;await write({players:[]})}}
}

function startWorldMapPlayers(manager,warn=console.warn) {
  let publisher,signature,closed=false,pending=false,work=Promise.resolve(),closeWork
  const tick=()=>{
    if(closed||pending)return
    pending=true
    work=(async()=>{
      const nextSignature=JSON.stringify(manager.config?.worldMap||{})
      if(signature!==nextSignature){
        const next=createWorldMapPublisher(manager,warn)
        await publisher?.close()
        publisher=next;signature=nextSignature
      }
      if(!closed)await publisher?.tick?.()
    })().catch(error=>warn('[web] World publisher configuration: '+error.message)).finally(()=>{pending=false})
    return work
  }
  tick();const timer=setInterval(tick,1000);timer.unref()
  return {close(){if(!closeWork){closed=true;clearInterval(timer);closeWork=work.then(()=>publisher?.close())}return closeWork}}
}

module.exports={livePlayers,startWorldMapPlayers,modelPlayers,defaultSkin}
