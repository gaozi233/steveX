const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events')
const {validateEnvironmentConfig,writeEnvironmentConfig}=require('../src/utils/config_write')
test('releaseUse always removes owned listeners and lock when deactivation throws',()=>{
  const {startUse,releaseUse,hasUse}=require('../src/commands/held_use')
  const bot=Object.assign(new EventEmitter(),{entity:{id:1},inventory:new EventEmitter(),_client:new EventEmitter(),heldItem:{name:'shield',type:1,count:1},activateItem(){this.usingHeldItem=true},deactivateItem(){throw Error('disconnected')}})
  startUse(bot);assert.equal(hasUse(bot),true)
  assert.throws(()=>releaseUse(bot),/disconnected/)
  assert.equal(hasUse(bot),false);assert.equal(bot.listenerCount('heldItemChanged'),0);assert.equal(bot.inventory.listenerCount('updateSlot'),0);assert.equal(bot._client.listenerCount('entity_status'),0)
})
test('environment config validation preserves partial configs and rejects invalid critical shapes',()=>{
  for(const c of [{},{agents:[]},{web:{port:8090},renderer:{enabled:false}},{agents:[{name:'A',minecraft:{host:'localhost',port:25565}}]}])assert.equal(validateEnvironmentConfig(c),null)
  for(const c of [null,[],{web:[]},{web:{port:'8090'}},{agents:{}},{agents:[{name:'A'},{name:'A'}]},{agents:[{name:'A',minecraft:{port:0}}]},{worldMap:{enabled:'false'}}])assert.equal(typeof validateEnvironmentConfig(c),'string')
})
test('atomic config replacement preserves original on failure and removes temporary files',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stevex-config-maintenance-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}))
  const file=path.join(dir,'config.json');await fs.writeFile(file,'old')
  await assert.rejects(writeEnvironmentConfig(file,'new',{...fs,rename:async()=>{throw Error('rename failed')}}),/rename failed/)
  assert.equal(await fs.readFile(file,'utf8'),'old');assert.deepEqual(await fs.readdir(dir),['config.json'])
  await writeEnvironmentConfig(file,'new');assert.equal(await fs.readFile(file,'utf8'),'new');assert.deepEqual(await fs.readdir(dir),['config.json'])
  await assert.rejects(writeEnvironmentConfig(file,'partial',{...fs,open:async(...args)=>{
    const handle=await fs.open(...args);return {writeFile:async()=>{throw Error('write failed')},close:()=>handle.close()}
  }}),/write failed/)
  assert.equal(await fs.readFile(file,'utf8'),'new');assert.deepEqual(await fs.readdir(dir),['config.json'])
})
test('test runner discovers nested official tests but no ignored runtime snapshots or helpers',()=>{
  const {testFiles}=require('../scripts/run-tests'),root=path.resolve(__dirname)
  const files=testFiles(root)
  assert.ok(files.some(file=>file.endsWith(path.join('nbt','query.test.js'))))
  assert.ok(files.every(file=>file.startsWith(root+path.sep)&&file.endsWith('.test.js')))
  assert.ok(!files.some(file=>file.includes('commit-check')||file.endsWith('helpers.js')))
})
