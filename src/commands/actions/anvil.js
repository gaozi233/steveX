const api = require('../workstations')
const native = require('../workstation_native')
module.exports = {
  name: 'anvil', description: 'Rename/combine in an already-open anvil; open via right click',
  usage: 'anvil rename <slot> <name> | anvil combine <slot1> <slot2> [name]',
  handler: (bot, args = [], agent, options = {}) => api.guarded(() => native.anvil(bot, args, options.signal))
}
