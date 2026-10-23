const stores = new WeakMap()
function attachBlockTags(bot) {
  if (stores.has(bot)) return
  const store = { tags:null }
  stores.set(bot,store)
  const update = packet => {
    const group = packet.tags?.find(group=>['minecraft:block','block'].includes(group.tagType))
    if (!group) return
    store.tags = new Map(group.tags.map(tag=>[tag.tagName.includes(':')?tag.tagName:'minecraft:'+tag.tagName,
      [...new Set(tag.entries.filter(id=>Number.isInteger(id)&&id>=0))]]))
  }
  bot._client.on('tags',update)
  bot.once('end',()=>{bot._client.removeListener('tags',update);stores.delete(bot)})
}
function blockTag(bot,name) {
  const tags=stores.get(bot)?.tags
  return { available:tags!==null&&tags!==undefined, entries:tags?.get(name) }
}
function blockTagDirectory(bot) {
  const tags=stores.get(bot)?.tags
  return tags ? [...tags].map(([name,entries])=>({name,entries:[...entries]})) : null
}
module.exports={attachBlockTags,blockTag,blockTagDirectory}
