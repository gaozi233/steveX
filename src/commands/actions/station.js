const api = require('../workstations')
module.exports = {
  name: 'station', description: 'Operate brewing, loom, stonecutter, smithing, grindstone, cartography, beacon or crafter windows',
  usage: 'station take <windowSlot>|select <index>|crafter <windowSlot> <enabled|disabled>|beacon <primary> [secondary|none]',
  handler: require('../workstation_feedback').workstationAction('station',api.station)
}
