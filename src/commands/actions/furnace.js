const api = require('../workstations')
const native = require('../workstation_native')
module.exports = {
  name: 'furnace', description: 'Operate an already-open furnace, smoker or blast furnace; open via right click',
  usage: 'furnace input <slot> [count] | furnace fuel <slot> [count] | furnace take <input|fuel|output>',
  handler: (bot, args = [], agent, options = {}) => api.guarded(() => native.furnace(bot, args, options.signal))
}
