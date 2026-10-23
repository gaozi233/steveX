const api = require('../workstations')
const native = require('../workstation_native')
module.exports = {
  name: 'furnace', description: 'Operate open furnace/smoker/blast furnace. input/fuel take FIXED inventory slots 9..44, not native window player indices. Open via right click',
  usage: 'furnace input <inventorySlot> [count] | furnace fuel <inventorySlot> [count] | furnace take <input|fuel|output>',
  handler: require('../workstation_feedback').workstationAction('furnace',native.furnace)
}
