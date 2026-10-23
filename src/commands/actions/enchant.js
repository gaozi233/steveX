const api = require('../workstations')
const native = require('../workstation_native')
module.exports = {
  name: 'enchant', description: 'Operate open enchanting table; put/lapis source slots are FIXED inventory 9..44. Choice index is not a slot. Open via right click',
  usage: 'enchant put <inventorySlot> | enchant lapis <inventorySlot> | enchant choose <0..2> | enchant take',
  handler: require('../workstation_feedback').workstationAction('enchant',native.enchant)
}
