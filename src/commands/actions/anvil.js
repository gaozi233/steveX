const api = require('../workstations')
const native = require('../workstation_native')
module.exports = {
  name: 'anvil', description: 'Rename/combine in open anvil; source slots are FIXED inventory 9..44. Open via right click',
  usage: 'anvil rename <inventorySlot> <name> | anvil combine <inventorySlot1> <inventorySlot2> [name]',
  handler: require('../workstation_feedback').workstationAction('anvil',native.anvil)
}
