const api = require('../workstations')
module.exports = {
  name: 'station', description: 'Operate brewing, loom, stonecutter, smithing, grindstone, cartography, beacon or crafter windows',
  usage: 'station open <type>|move <source> <dest> [count]|take <slot>|select <index>|crafter <slot> <enabled|disabled>|beacon <primary> [secondary|none]',
  handler: (bot, args = [], agent, options = {}) => api.guarded(() => api.station(bot, args, options.signal))
}
