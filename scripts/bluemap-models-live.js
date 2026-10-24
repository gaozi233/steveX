// Reuses the isolated saved natural world and rendered tiles. No Fabric or model API.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process')
const {AgentManager}=require('../src/agent/agent_manager'),{startWebServer}=require('../src/web/server')
const {install}=require('./install-map-player-models'),{mapJava,java,jar,directory:trial}=require('./bluemap-trial')
const directory=path.resolve(__dirname,'../runs/bluemap-natural'),roles=['Map-A','Map-B','Map-C']
const children=[];let manager,web,closed=false,timer
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
function launch(name,exe,args,cwd){
  const child=spawn(exe,args,{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']}),s={name,child,log:''}
  for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{s.log+=b;process.stdout.write(`[${name}] ${b}`)})
  child.on('error',e=>s.error=e);child.on('exit',code=>{s.exited=true;s.code=code})
  children.push(s);return s
}
async function until(fn,label,ms=180000){const end=Date.now()+ms;while(!closed && Date.now()<end){for(const s of children)if(s.error||s.exited)throw s.error||Error(s.name+' exited '+s.code);if(await fn())return;await sleep(200)}throw Error('Timed out: '+label)}
async function close(){
  if(closed)return;closed=true;clearInterval(timer)
  await manager?.close().catch(()=>{})
  if(web){web.closeResources();web.closeAllConnections();await new Promise(r=>web.close(r))}
  for(const s of children){if(!s.exited){if(s.name==='minecraft'){s.child.stdin.write('stop\n');await sleep(3000)}if(!s.exited)s.child.kill()}}
}
async function main(){
  if(!process.argv.includes('--live')){console.log('Use --live. Requires the saved runs/bluemap-natural world and BlueMap 5.29 assets.');return}
  await fs.access(path.join(directory,'server/natural-world/level.dat'))
  await install(path.join(directory,'web'),path.join(trial,'data/minecraft-client-1.21.11.jar'))
  process.on('SIGINT',close);process.on('SIGTERM',close)
  timer=setInterval(async()=>{if(await fs.stat(path.join(directory,'STOP-MODELS')).catch(()=>null)){await fs.unlink(path.join(directory,'STOP-MODELS'));await close()}},1000)
  const server=launch('minecraft',java,['-Xms256M','-Xmx1536M','-jar',path.join(trial,'server/server-bootstrap.jar'),'nogui'],path.join(directory,'server'))
  await until(()=>/Done \(/.test(server.log),'Minecraft startup')
  const config={web:{host:'127.0.0.1',port:8090},worldMap:{enabled:true,url:'http://127.0.0.1:8100/',
    playersFile:path.join(directory,'web/maps/natural/live/players.json'),modelsFile:path.join(directory,'web/assets/bluemap-player-models/players.json'),mapId:'natural'},
    renderer:{enabled:false},agents:roles.map((name,i)=>({name,minecraft:{host:'127.0.0.1',port:25568,version:'1.21.11',username:'SteveX-Map'+String.fromCharCode(65+i),auth:'offline'},brain:{enabled:false}}))}
  manager=new AgentManager(()=>config);web=startWebServer(manager)
  web.on('error',error=>{console.error(error);close()})
  for(const role of roles)manager.connectAgent(role)
  await until(()=>roles.every(name=>manager.agents.get(name)?.isOnline()),'three players',60000)
  for(const [i,role] of roles.entries()){
    const bot=manager.agents.get(role).bot,name=bot.username
    server.child.stdin.write(`gamemode creative ${name}\nitem replace entity ${name} armor.chest with ${['diamond_chestplate','golden_chestplate','iron_chestplate'][i]}\nitem replace entity ${name} weapon.mainhand with ${['diamond_sword','iron_axe','bow'][i]}\nitem replace entity ${name} weapon.offhand with shield\n`)
  }
  launch('bluemap',await mapJava(),['-Xms128M','-Xmx768M','-jar',path.join(trial,jar),'-c','config','-v','1.21.11','-w'],directory)
  await until(async()=>{try{return(await fetch('http://127.0.0.1:8100/settings.json')).ok}catch{return false}},'BlueMap HTTP')
  await fs.writeFile(path.join(directory,'models-live.json'),JSON.stringify({ready:true,pids:{supervisor:process.pid,...Object.fromEntries(children.map(s=>[s.name,s.child.pid]))},players:roles,paidModelCalls:0,fabricClients:0},null,2))
  console.log('READY: http://127.0.0.1:8090/world | Minecraft 127.0.0.1:25568 | 3 Mineflayer players, no Fabric')
}
if(require.main===module)main().catch(async error=>{console.error(error);await close();process.exitCode=1})
