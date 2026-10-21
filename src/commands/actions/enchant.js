const api = require('../workstations')
const native = require('../workstation_native')
module.exports = {
  name: 'enchant', description: 'Open and operate an enchantment table',
  usage: 'enchant [open|put <slot>|lapis <slot>|choose <0..2>|take]',
  handler: (bot, args = [], agent, options = {}) => api.guarded(() => native.enchant(bot, args, options.signal))
}
