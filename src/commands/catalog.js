const categories = [
  { id: 'query', title: '状态与环境查询 / State and environment', note: 'Read-only; does not interrupt actions. Client-known data is not necessarily line-of-sight.', names: 'pos hp hunger oxygen inventory nearby gamemode xp time weather window findplayer findblock recipes' },
  { id: 'motion', title: '朝向、移动与动作控制 / Motion and control', note: 'Angles in radians; movement duration in milliseconds; wait uses physics ticks. stop is immediate; stand is queued.', names: 'look lookat move jump swing stand stop stopdig goto follow wait' },
  { id: 'gather', title: '采集、合成与建造 / Gathering and building', note: 'Action success does not imply dropped items were collected.', names: 'dig mine collect craft place placeentity' },
  { id: 'inventory', title: '背包、持物与消耗 / Inventory and items', note: 'Check available items and slots before acting.', names: 'equip hotbar unequip use release drop toss' },
  { id: 'container', title: '容器与槽位 / Containers and slots', note: 'Use current window slot indices, not fixed player-inventory indices.', names: 'open openentity dispenser click moveslot putaway transfer close' },
  { id: 'workstation', title: '工作站与交易 / Workstations and trading', note: 'Inspect the open window before choosing an operation.', names: 'furnace anvil enchant station trade' },
  { id: 'survival', title: '生存与实体交互 / Survival and entities', note: 'Actions may change health, inventory or entity state.', names: 'attack interact interactat useon eat fish sleep wake respawn' },
  { id: 'vehicle', title: '载具与飞行 / Vehicles and gliding', note: 'Requires the appropriate vehicle or equipment.', names: 'mount dismount drive elytra' },
  { id: 'communication', title: '通信与客户端管理 / Communication and client management', note: 'May send chat, change settings or disconnect.', names: 'say whisper writebook settings quit acceptpack denypack' },
  { id: 'creative', title: '创造与特权工具 / Creative and privileged tools', note: 'Requires appropriate permission or mode. Brain excludes commands with kind=creative by default; category is not authorization.', names: 'setcommandblock clearinventory clearslot flyto setinventory startfly stopfly' }
]

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
module.exports = { categories, categoryFor, groupCommands, formatCommandCatalog }
