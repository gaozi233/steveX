const api = require('../workstations')
const native = require('../workstation_native')
module.exports = {
  name: 'anvil', description: 'Open, rename or combine items in an anvil',
  usage: 'anvil [open|rename <slot> <name>|combine <slot1> <slot2> [name]]',
  handler: (bot, args = [], agent, options = {}) => api.guarded(() => native.anvil(bot, args, options.signal))
}
