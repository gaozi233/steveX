const categories = [
  { id: 'query', title: '状态与环境查询 / State and environment', note: 'Read-only; does not interrupt actions. Client-known data is not necessarily line-of-sight. Exact positional arity; errors include errorCode, empty searches are successful.', names: 'pos hp hunger oxygen inventory nearby gamemode xp time weather window findplayer findblock recipes' },
  { id: 'motion', title: '朝向、移动与动作控制 / Motion and control', note: 'Angles in radians; movement duration in milliseconds; wait uses physics ticks. sneak on persists across motion/turning/clicks; off releases, tap is 150ms and never releases an existing hold. stop/cancellation releases held controls. swing is animation only.', names: 'look lookat move sneak jump swing stand stop goto follow wait' },
  { id: 'gather', title: '采集、合成与建造 / Gathering and building', note: 'dig without coordinates never moves; dig x y z may approach without digging/building en route; dig stop cancels digging/approach. rightclick chooses one aimed route without retries. Success does not imply drop pickup.', names: 'dig collect craft rightclick' },
  { id: 'inventory', title: '背包、持物与消耗 / Inventory and items', note: 'Exact item names; hotbar indices 0..8. rightdown holds right mouse for held-item use; rightup ends hold. Motion/turning preserves hold. Inventory/interaction actions or safety stops end hold. Request acknowledgement is not confirmed effect.', names: 'equip hotbar unequip rightdown rightup drop' },
  { id: 'container', title: '容器与槽位 / Containers and slots', note: 'Use current window slot indices, not fixed player-inventory indices. slotclick is a window click, not world rightclick.', names: 'open openentity dispenser slotclick moveslot putaway transfer close' },
  { id: 'workstation', title: '工作站与交易 / Workstations and trading', note: 'Inspect the open window before choosing an operation.', names: 'furnace anvil enchant station trade' },
  { id: 'survival', title: '生存与实体交互 / Survival and entities', note: 'attack assists target selection; interactentity tracks a named/id target without requiring pre-aim. fish is automated casting/waiting/reeling, not a single click.', names: 'attack interactentity fish wake respawn' },
  { id: 'communication', title: '通信与客户端管理 / Communication and client management', note: 'May send chat, change settings or disconnect.', names: 'say whisper writebook settings quit acceptpack denypack' },
  { id: 'creative', title: '创造与特权工具 / Creative and privileged tools', note: 'Hidden from the default Brain catalog; explicit allowedCommands may expose them. Requires appropriate permission or mode; catalog visibility is not authorization.', names: 'setcommandblock clearinventory clearslot flyto setinventory startfly stopfly' }
]

const clientManagementCommands = new Set(['settings', 'quit', 'acceptpack', 'denypack'])
function isDefaultLLMCommand(command) {
  return command.kind !== 'creative' && command.category !== 'creative' && !clientManagementCommands.has(command.name)
}

const byName = new Map()
for (const category of categories) for (const name of category.names.split(' ')) {
  if (byName.has(name)) throw new Error(`Duplicate command category: ${name}`)
  byName.set(name, category.id)
}
function categoryFor(name) {
  if (!byName.has(name)) throw new Error(`Missing command category: ${name}`)
  return byName.get(name)
}
function groupCommands(commands) {
  return categories.map(({ names, ...category }) => ({ ...category,
    commands: names.split(' ').map(name => commands.find(c => c.name === name)).filter(Boolean)
  })).filter(category => category.commands.length)
}
function formatCommandCatalog(commands) {
  return groupCommands(commands).map(c => `[${c.title}]\n${c.note}\n${c.commands.map(command => `${command.usage} -- ${command.description}`).join('\n')}`).join('\n\n')
}
module.exports = { categories, categoryFor, groupCommands, formatCommandCatalog, isDefaultLLMCommand }
