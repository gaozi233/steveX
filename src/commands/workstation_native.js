const api = require('./workstations')

async function enchant(bot, args = [], signal) {
  signal?.throwIfAborted()
  const op = args[0] || 'open'
  if (op === 'open') return api.open(bot, ['enchanting_table'], 'openEnchantmentTable')
  const w = api.current(bot, ['minecraft:enchantment', 'minecraft:enchanting_table'])
  if (op === 'put' || op === 'lapis') {
    const item = api.slot(w, args[1], true)
    if (op === 'lapis' && item.name !== 'lapis_lazuli') throw new Error('Choose a lapis_lazuli inventory slot')
    if (w.slots[op === 'put' ? 0 : 1]) throw new Error('Target slot occupied; take it out first')
    await w[op === 'put' ? 'putTargetItem' : 'putLapis'](item)
  } else if (op === 'choose') {
    const choice = api.integer(args[1], 'enchantment choice', 0, 2)
    if (!w.enchantments?.[choice] || w.enchantments[choice].level <= 0) throw new Error('Enchantment unavailable; inspect window after inserting item/lapis')
    await w.enchant(choice)
  } else if (op === 'take') { api.slot(w, '0'); await w.takeTargetItem() }
  else throw new Error('Usage: enchant [open|put <slot>|lapis <slot>|choose <0..2>|take]')
  return api.success(bot, `Enchantment operation ${op} completed`)
}

async function anvil(bot, args = [], signal) {
  signal?.throwIfAborted()
  if (!args.length || args[0] === 'open') return api.open(bot, ['anvil', 'chipped_anvil', 'damaged_anvil'], 'openAnvil')
  const w = api.current(bot, ['minecraft:anvil'])
  const first = api.slot(w, args[1], true)
  if (args[0] === 'rename') {
    const name = args.slice(2).join(' ')
    if (!name || name.length > 35) throw new Error('Name must contain 1..35 characters')
    await w.rename(first, name)
  } else if (args[0] === 'combine') {
    const second = api.slot(w, args[2], true)
    if (first.slot === second.slot) throw new Error('Choose two different inventory slots')
    await w.combine(first, second, args.slice(3).join(' ') || undefined)
  } else throw new Error('Usage: anvil [open|rename <slot> <name>|combine <slot1> <slot2> [name]]')
  return api.success(bot, `Anvil operation ${args[0]} completed`)
}

async function furnace(bot, args = [], signal) {
  signal?.throwIfAborted()
  if (!args.length || args[0] === 'open') return api.open(bot, ['furnace', 'blast_furnace', 'smoker'], 'openFurnace')
  const w = api.current(bot, ['minecraft:furnace', 'minecraft:blast_furnace', 'minecraft:smoker'])
  if (args[0] === 'input' || args[0] === 'fuel') {
    const item = api.slot(w, args[1], true), count = api.integer(args[2] ?? 1, 'count', 1, item.count)
    await w[args[0] === 'input' ? 'putInput' : 'putFuel'](item.type, item.metadata, count)
  } else if (args[0] === 'take') {
    const methods = { input: ['takeInput', 0], fuel: ['takeFuel', 1], output: ['takeOutput', 2] }
    const op = Object.hasOwn(methods, args[1]) ? methods[args[1]] : null
    if (!op) throw new Error('Expected input, fuel or output')
    api.slot(w, String(op[1])); await w[op[0]]()
  } else throw new Error('Usage: furnace [open|input <slot> [count]|fuel <slot> [count]|take <input|fuel|output>]')
  return api.success(bot, `Furnace operation ${args.join(' ')} completed`)
}
module.exports = { enchant, anvil, furnace }
