/**
 * respawn — manually respawn after death
 */
module.exports = {
  name: 'respawn',
  description: 'Request respawn only after observed death; request is not confirmed recovery',
  usage: 'respawn',
  async handler(bot) {
    if(!Number.isFinite(bot.health)||bot.health>0)return {ok:false,errorCode:'NOT_DEAD',error:'No observed death; no respawn sent'}
    await bot.respawn()
    return { ok: true,status:'requested',confirmed:false,evidence:[],output: 'Respawn requested; recovery not confirmed' }
  }
}
module.exports.handler=require('../command_contract').withContract('respawn',module.exports.handler)
