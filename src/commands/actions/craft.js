const { operation, position, counts, inventoryChanges, syncInventory } = require('../operation_result')
const { sleep } = require('../../agent/action_executor')
const registry = require('../../runtime/skill_registry.ts')
const { diagnoseCraft } = require('../craft_preflight')

function tableInReach(bot) {
  const id = bot.registry.blocksByName.crafting_table.id
  const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0)
  return bot.findBlocks({ matching: id, maxDistance: 5, count: 32 }).map(p => bot.blockAt(p)).filter(b => b && b.position.offset(0.5,0.5,0.5).distanceTo(eye) <= 4.5 && bot.canSeeBlock(b)).sort((a,b) => a.position.distanceTo(eye)-b.position.distanceTo(eye))[0] || null
}
// Conservative capacity preflight for recipe outputs, including slots freed by inputs.
function hasRoom(bot, recipe, times) {
  const w = bot.inventory
  const slots = w.slots.slice(w.inventoryStart, w.inventoryEnd).map(i => i ? { type: i.type, count: i.count, metadata: i.metadata, special: !!i.nbt || !!i.components?.length } : null)
  for (let n=0; n<times; n++) {
    for (const d of recipe.delta.filter(d => d.count < 0)) {
      let remaining = -d.count
      for (let i=0;i<slots.length && remaining;i++) if (slots[i]?.type===d.id && (d.metadata==null || slots[i].metadata===d.metadata)) {
        const used = Math.min(remaining,slots[i].count); remaining-=used; slots[i].count-=used
        if (!slots[i].count) slots[i]=null
      }
      if (remaining) return false
    }
    for (const d of recipe.delta.filter(d => d.count > 0)) {
      let remaining=d.count
      const size=bot.registry.items[d.id]?.stackSize || 64
      for (const slot of slots) if (slot?.type===d.id && !slot.special && (d.metadata==null || slot.metadata===d.metadata)) {
        const added=Math.min(remaining,Math.max(0,size-slot.count));slot.count+=added;remaining-=added
      }
      for(let i=0;i<slots.length && remaining;i++) if(!slots[i]) { const added=Math.min(remaining,size);slots[i]={type:d.id,count:added,metadata:d.metadata};remaining-=added }
      if(remaining) return false
    }
  }
  return true
}

const skill = {
  name: 'craft',
  description: 'Craft from backpack and reachable table; times=executions 1..64, not items; optional recipeIndex selects an exact catalog entry without fallback; one executable recipe runs, multiple return availableRecipes; reports observed net inventory changes',
  usage: 'craft <itemName> [times] [auto|hand|table] [recipeIndex]',
  args: { itemName: { required: true }, times: { required: false, default: 1, desc: 'Recipe executions, not output quantity (1..64)' }, station: { required: false, default: 'auto' }, recipeIndex: { required: false, desc: '1-based index from recipes for this exact item; omit only if unambiguous' } },
  handler: operation('craft', async (bot, args, agent, { signal } = {}) => {
    const rejected = (errorCode, reason, target = null) => {
      const error = `Craft not started: ${reason}`
      return { ok: false, errorCode, error, output: error, target,
        phase: 'preflight', effect: 'none', completedExecutions: 0, producedCount: 0, changes: [], evidence: [] }
    }
    if(args.length<1 || args.length>4 || args.some(a => typeof a !== 'string') || !/^(?:minecraft:)?[a-z0-9_]+$/i.test(args[0])) return rejected('INVALID_ARGUMENTS', 'Usage: craft <itemName> [times] [auto|hand|table] [recipeIndex]')
    const name=args[0].toLowerCase().replace(/^minecraft:/,''), times=args[1]===undefined?1:(/^\d+$/.test(args[1])?Number(args[1]):NaN), mode=args[2]===undefined?'auto':args[2]
    if(!Number.isInteger(times)||times<1||times>64) return rejected('INVALID_ARGUMENTS', 'Recipe executions must be an integer 1..64')
    if(!['auto','hand','table'].includes(mode)) return rejected('INVALID_ARGUMENTS', 'Station must be auto, hand or table')
    const recipeIndex = args[3] === undefined ? undefined : (/^[1-9]\d*$/.test(args[3]) ? Number(args[3]) : NaN)
    if(recipeIndex !== undefined && !Number.isSafeInteger(recipeIndex)) return rejected('INVALID_ARGUMENTS', 'recipeIndex must be a positive safe integer from recipes')
    const item=Object.hasOwn(bot.registry.itemsByName,name)?bot.registry.itemsByName[name]:null
    if(!item) return rejected('UNKNOWN_ITEM', `Unknown item: ${name}`)
    const request = { item: name, requestedExecutions: times, station: mode, ...(recipeIndex === undefined ? {} : { recipeIndex }) }
    if(bot.currentWindow) return rejected('WINDOW_OPEN', 'Craft requires no currently open window', request)
    if(bot.inventory.selectedItem) return rejected('CURSOR_NOT_EMPTY', 'Craft requires an empty cursor', request)
    try { await syncInventory(bot) }
    catch(e) { return rejected('INVENTORY_SYNC_FAILED', `No crafting started: ${e.message}`, request) }
    let preflight
    try { preflight = diagnoseCraft(bot, item, times, mode, mode === 'hand' ? null : tableInReach(bot), hasRoom, recipeIndex) }
    catch(e) { return rejected('CRAFT_PREFLIGHT_FAILED', `No crafting started: ${e.message}`, request) }
    if (preflight.failure) return preflight.failure
    const { recipe, table } = preflight
    let before
    try { before=counts(bot) }
    catch(e) { return rejected('INVENTORY_READ_FAILED', `No crafting started: ${e.message}`, request) }
    const expected=new Map()
    for(const d of recipe.delta) { const n=bot.registry.items[d.id]?.name; if(n) expected.set(n,(expected.get(n)||0)+d.count) }
    const target={item:name,requestedExecutions:times,recipeIndex:preflight.recipeIndex,station:table?'table':'hand',...(table?{position:position(table.position)}:{})}
    let completed=0,error=null
    try {
      for(let i=0;i<times;i++) {
        signal?.throwIfAborted()
        if(table && bot.blockAt(table.position)?.name!=='crafting_table') throw Object.assign(Error('Crafting table changed'), { code: 'WORKBENCH_CHANGED' })
        await bot.craft(recipe,1,table)
        await sleep(100,signal)
        await syncInventory(bot)
        const current=counts(bot)
        if([...expected].some(([n,delta])=>(current.get(n)||0)-(before.get(n)||0)!==delta*(i+1))) throw Object.assign(Error('Server inventory delta mismatches recipe; no automatic retry'), { code: 'INVENTORY_MISMATCH' })
        completed++
      }
    } catch(e) { error=e }
    finally {
      try { if(bot.currentWindow?.type?.startsWith('minecraft:crafting')) await bot.closeWindow(bot.currentWindow) }
      catch(e) { if(!error) error=Object.assign(e, { code: 'WINDOW_CLOSE_FAILED' }) }
    }
    // Cancellation can occur between optimistic clicks and their server replies.
    // Obtain a final snapshot even when the caller's signal is already aborted.
    let after
    try { await sleep(100); await syncInventory(bot); after=counts(bot) }
    catch(e) { return {ok:false,cancelled:!!signal?.aborted,errorCode:'CONFIRMATION_UNAVAILABLE',error:`Final inventory confirmation unavailable: ${e.message}`,target,phase:'confirmation',effect:'unknown',completedExecutions:completed,producedCount:null,changes:null,evidence:[],output:`Craft not confirmed: ${e.message}; ${completed}/${times} executions verified earlier; final inventory changes and net ${name} output unknown`} }
    const changes=inventoryChanges(before,after), producedCount=changes.find(c=>c.item===name)?.delta||0
    const feedback={target,phase:'execution',effect:'observed',changes,changesScope:'net-inventory-by-item-name',completedExecutions:completed,producedCount}
    if(error) {
      const knownCode = ['WORKBENCH_CHANGED','INVENTORY_MISMATCH','WINDOW_CLOSE_FAILED'].includes(error.code)
      const errorCode = signal?.aborted
        ? (signal.reason?.code === 'ACTION_TIMEOUT' ? 'ACTION_TIMEOUT' : 'CANCELLED')
        : (knownCode ? error.code : 'CRAFT_EXECUTION_FAILED')
      return {...feedback,ok:false,cancelled:!!signal?.aborted,errorCode,error:error.message,evidence:['server-inventory-snapshot'],output:`Craft incomplete: ${completed}/${times} executions verified; ${name} net change ${producedCount}; net inventory changes: ${JSON.stringify(changes)}; ${error.message}`}
    }
    return {...feedback,ok:true,confirmed:true,evidence:['server-inventory-snapshot','recipe-material-and-output-deltas'],executions:times,item:name,output:`Crafted ${name} x${producedCount} (${completed} recipe executions, ${table?'table':'hand'}, recipeIndex=${preflight.recipeIndex}); net inventory changes: ${JSON.stringify(changes)}`}
  })
}
registry.register(skill)
module.exports = skill
