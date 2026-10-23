const api = require('../workstations')
const native = require('../workstation_native')
module.exports = {
  name: 'enchant', description: 'Operate an already-open enchanting table; open via right click',
  usage: 'enchant put <slot> | enchant lapis <slot> | enchant choose <0..2> | enchant take',
  handler: (bot, args = [], agent, options = {}) => api.guarded(() => native.enchant(bot, args, options.signal))
}
