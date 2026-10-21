const api = require('../workstations')
const native = require('../workstation_native')
module.exports = {
  name: 'furnace', description: 'Open and operate a furnace, smoker or blast furnace',
  usage: 'furnace [open|input <slot> [count]|fuel <slot> [count]|take <input|fuel|output>]',
  handler: (bot, args = [], agent, options = {}) => api.guarded(() => native.furnace(bot, args, options.signal))
}
