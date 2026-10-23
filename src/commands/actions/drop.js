const { dropAction } = require('../inventory_actions')
module.exports = {
  name: 'drop',
  description: 'Drop exact-name items; omitted count drops the first stack, explicit count spans only identical-component stacks; confirms carried inventory loss, not who picks it up',
  usage: 'drop <itemName> [count]',
  handler: dropAction('drop')
}
