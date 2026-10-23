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
  }
}

const skill = {
  name: 'findblock',
  description: 'Search nearest loaded block by exact name/#tag, all states; return name/coordinates/properties, no purpose/safety decisions or sight filter. Discover tags with findblock tags [filter] (up to 50 names/counts), inspect with findblock tag <#tag> (up to 128 block names); truncated flags/counts explicit. Directory queries read synchronized server tags only, do not search world or move',
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

    const found = Array.isArray(matching)&&matching.length===0 ? null : agent.bot.findBlock({
      matching,
      point: origin,
      maxDistance,
      count: 1
    })

    if (!found) return { ok: true, output: `No "${targetName}" found within ${maxDistance}m`, found: false, radius: maxDistance }

    const pos = found.position
    const distance = pos.distanceTo(origin)
    const properties=found.getProperties?.() || {}
    const block=found.name || targetName
    const state=Object.entries(properties).map(([key,value])=>`${key}=${value}`).join(',')
    return { ok: true, output: `Found ${block}${state?'['+state+']':''} at ${pos.x} ${pos.y} ${pos.z} (block-grid distance: ${distance.toFixed(1)}m)`,
      found: true, block, properties, position: { x: pos.x, y: pos.y, z: pos.z }, distance, radius: maxDistance }
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
  usage: 'findblock <blockName|#tag> [radius] | findblock tags [filter] | findblock tag <#tag>',
  handler: skill.handler
}
