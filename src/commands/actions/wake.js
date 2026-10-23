/**
 * wake — get out of bed
 */
module.exports = {
  name: 'wake',
  description: 'Get out of bed',
  usage: 'wake',
  async handler(bot) {
    if (!bot.isSleeping) return { ok: false,errorCode:'NOT_SLEEPING',error: 'Not sleeping' }
    await bot.wake()
    return { ok: true,status:'requested',confirmed:false,evidence:[],output: 'Wake requested; inspect sleep state before claiming recovery' }
  }
}
module.exports.handler=require('../command_contract').withContract('wake',module.exports.handler)
