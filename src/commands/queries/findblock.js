const skillRegistry = require("../../runtime/skill_registry.ts");

const args = {
  blockName: {
    desc: 'Exact block name/#tag to search, tags [filter] to list tag names, or tag <#tag> to inspect block members; directory calls do not search the world',
    required: true
  },
  radius: {
    desc: 'Search: radius integer 1..128 (default 32). tags: optional name filter. tag: required #tag; neither directory mode takes a radius',
    default: 32,
    required: false
  },
  count: {desc:'World-search result limit 1..16, default 1; not accepted in tags/tag directory modes',default:1,required:false}
}

const skill = {
  name: 'findblock',
  description: 'Search loaded blocks by exact name/#tag, all states; radius default 32 (1..128), count default 1 (1..16). Return nearest-first candidates with actual name/coordinates/properties; count limits results, not total world matches. Bed halves remain separate, no purpose/safety or sight decisions. Discover tags with tags [filter] (up to 50), inspect tag <#tag> (up to 128 members); directory modes take no radius/count and do not search the world',
  args,
  async handler(_b, args, agent) {
    if (args.length < 1) return { ok: false, error: 'Usage: findblock <blockName> [radius]' }
    const query = args[0].toLowerCase()
    if (query === 'tags' || query === 'tag') {
      const directory=require('../../agent/block_tags').blockTagDirectory(agent.bot)
      if(directory===null)return {ok:false,errorCode:'TAG_DATA_UNAVAILABLE',error:'Server block tags have not been synchronized'}
      if(query==='tags'){
        const filter=(args[1]||'').toLowerCase().replace(/^#/,'')
        const matches=directory.filter(t=>t.name.includes(filter)).sort((a,b)=>a.name.localeCompare(b.name))
        const tags=matches.slice(0,50).map(t=>({name:'#'+t.name,count:t.entries.length}))
        const truncated=matches.length>tags.length
        return {ok:true,mode:'tags',source:'server-block-tags',tags,total:matches.length,returned:tags.length,truncated,
          output:`Block tags: ${tags.length}/${matches.length}${truncated?' (truncated; narrow filter)':''}\n${tags.map(t=>`${t.name} (${t.count} blocks)`).join('\n')}`}
      }
      const input=args[1].toLowerCase().slice(1),name=input.includes(':')?input:'minecraft:'+input
      const tag=directory.find(t=>t.name===name)
      if(!tag)return {ok:false,errorCode:'UNKNOWN_BLOCK_TAG',error:`Unknown block tag: #${name}`}
      const registry=agent.bot.registry || require('minecraft-data')(agent.bot.version)
      const names=tag.entries.map(id=>registry.blocks[id]?.name).filter(Boolean).sort()
      const blocks=names.slice(0,128),unresolvedCount=tag.entries.length-names.length,truncated=blocks.length<names.length
      return {ok:true,mode:'tag',source:'server-block-tags',tag:'#'+name,blocks,total:tag.entries.length,returned:blocks.length,truncated,
        ...(unresolvedCount?{unresolvedCount}:{}),output:`#${name}: ${blocks.length}/${tag.entries.length} blocks${truncated?' (truncated)':''}${unresolvedCount?`; ${unresolvedCount} unresolved registry entries`:''}\n${blocks.join(', ')}`}
    }
    const targetName = query.replace(/^minecraft:/, '')
    const maxDistance = args[1] === undefined ? 32 : /^\d+$/.test(args[1]) ? Number(args[1]) : NaN
    if (!Number.isInteger(maxDistance) || maxDistance < 1 || maxDistance > 128) return { ok: false, error: 'Radius must be an integer in 1..128 blocks' }

    let matching
    if (query.startsWith('#')) {
      const name=query.slice(1).includes(':')?query.slice(1):'minecraft:'+query.slice(1)
      const tag=require('../../agent/block_tags').blockTag(agent.bot,name)
      if(!tag.available)return {ok:false,errorCode:'TAG_DATA_UNAVAILABLE',error:'Server block tags have not been synchronized; no guessed fallback'}
      if(tag.entries===undefined)return {ok:false,errorCode:'UNKNOWN_BLOCK_TAG',error:`Unknown block tag: #${name}`}
      matching=tag.entries
    } else {
      const registry=agent.bot.registry || require('minecraft-data')(agent.bot.version)
      matching=registry.blocksByName[targetName]?.id
      if (matching === undefined) return { ok: false, errorCode: 'UNKNOWN_BLOCK', error: `Unknown block: "${targetName}"` }
    }

    const origin = agent.bot.entity.position.floored()
    const count=args[2]===undefined?1:Number(args[2]),options={matching,point:origin,maxDistance,count}
    let candidates=[]
    if(!(Array.isArray(matching)&&matching.length===0)) {
      if(count===1){const block=agent.bot.findBlock(options);if(block)candidates=[block]}
      else candidates=agent.bot.findBlocks(options).map(p=>agent.bot.blockAt(p)).filter(Boolean)
    }
    const blocks=candidates.map(b=>({block:b.name||targetName,position:{x:b.position.x,y:b.position.y,z:b.position.z},
      distance:b.position.distanceTo(origin),properties:b.getProperties?.()||{}}))
      .sort((a,b)=>a.distance-b.distance||a.position.x-b.position.x||a.position.y-b.position.y||a.position.z-b.position.z).slice(0,count)
    const describe=b=>`${b.block}${Object.keys(b.properties).length?'['+Object.entries(b.properties).map(([k,v])=>`${k}=${v}`).join(',')+']':''} at ${b.position.x} ${b.position.y} ${b.position.z} (block-grid distance: ${b.distance.toFixed(1)}m)`
    return {ok:true,found:blocks.length>0,radius:maxDistance,count,returned:blocks.length,blocks,
      ...(count===1&&blocks.length?blocks[0]:{}),
      output:blocks.length?`Found ${blocks.length}/${count} requested candidates (not a total match count):\n${blocks.map(describe).join('\n')}`:`No "${targetName}" found within ${maxDistance}m`}
  }
}

skill.handler = require('../command_contract').withContract(skill.name, skill.handler)
skillRegistry.register(skill);

/**
 * findblock <blockName> [radius] — find the nearest block by name
 */
module.exports = {
  name: skill.name,
  description: skill.description,
  usage: 'findblock <blockName|#tag> [radius] [count] | findblock tags [filter] | findblock tag <#tag>',
  handler: skill.handler
}
