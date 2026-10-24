// Dedicated natural-world + three managed players + one hidden renderer acceptance.
// No paid models, keys, existing world edits, or foreground game windows.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn,execFile}=require('node:child_process')
const {AgentManager}=require('../src/agent/agent_manager')
const {startWebServer}=require('../src/web/server')
const {mapJava,java,jar,directory:trial}=require('./bluemap-trial')
const root=path.resolve(__dirname,'..'),directory=path.join(root,'runs/bluemap-natural')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const roles=['Map-A','Map-B','Map-C'],usernames=['SteveX-MapA','SteveX-MapB','SteveX-MapC']
const children=[],report={minecraft:'1.21.11',seed:'20261024',roles,captures:[],paidModelCalls:0}
let manager,web,server,map,saveTimer,stopTimer,closing=false
async function writeReport(){await fs.writeFile(path.join(directory,'results.json'),JSON.stringify(report,null,2))}
function launch(name,exe,args,cwd,env=process.env){
  const child=spawn(exe,args,{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']})
  const state={name,child,log:'',exited:false}
  for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{state.log+=b;process.stdout.write(`[${name}] ${b}`)})
  child.on('error',error=>{state.error=error})
  child.on('exit',code=>{state.exited=true;state.exitCode=code})
  children.push(state);return state
}
async function until(check,label,ms=120000){const end=Date.now()+ms;while(Date.now()<end){if(await check())return;await sleep(200)}throw Error('Timed out: '+label)}
async function logUntil(state,pattern,from=0,ms=120000){await until(()=>{if(state.error)throw state.error;if(pattern.test(state.log.slice(from)))return true;if(state.exited)throw Error(state.name+' exited '+state.exitCode);return false},String(pattern),ms)}
async function command(text,pattern){
  const from=server.log.length,ack='STEVEX_ACK_'+require('node:crypto').randomUUID()
  server.child.stdin.write(text+'\nsay '+ack+'\n')
  await logUntil(server,new RegExp(ack),from)
  const response=server.log.slice(from)
  ;(report.setupCommands ||= []).push({command:text,response})
  const unchangedForceLoad=text.startsWith('forceload add ') && /No chunks were marked for force loading/.test(response)
  if(pattern && !pattern.test(response) && !unchangedForceLoad)throw Error('Unexpected setup response for '+text)
}
async function prepare(){
  await fs.mkdir(path.join(directory,'server'),{recursive:true})
  await fs.mkdir(path.join(directory,'config/maps'),{recursive:true})
  await fs.mkdir(path.join(directory,'config/storages'),{recursive:true})
  const eula=await fs.readFile(path.join(trial,'server/eula.txt'),'utf8')
  if(!/^eula=true$/m.test(eula))throw Error('Run the accepted isolated BlueMap trial first')
  await fs.writeFile(path.join(directory,'server/eula.txt'),'eula=true\n')
  await fs.writeFile(path.join(directory,'server/server.properties'),[
    'server-ip=127.0.0.1','server-port=25568','online-mode=false','level-name=natural-world','level-type=minecraft:normal',
    'level-seed=20261024','generate-structures=true','view-distance=8','simulation-distance=4','max-players=8',
    'difficulty=peaceful','gamemode=creative','enable-rcon=false','enable-query=false','pause-when-empty-seconds=-1',
    'motd=SteveX natural map / three players / renderer',
  ].join('\n')+'\n')
  const write=(file,text)=>fs.writeFile(path.join(directory,'config',file),text)
  await write('core.conf',`accept-download: true\ndata: ${JSON.stringify(path.join(trial,'data').replaceAll('\\','/'))}\nrender-thread-count: 1\nmetrics: false\nscan-for-mod-resources: false\nupdate-cooldown: 5\nregion-file-check-interval: 5\n`)
  await write('webserver.conf','enabled: true\nwebroot: "web"\nip: "127.0.0.1"\nport: 8100\n')
  await write('storages/file.conf','storage-type: file\nroot: "web/maps"\ncompression: gzip\n')
}
async function shutdown(){
  if(closing)return;closing=true;clearInterval(saveTimer);clearInterval(stopTimer)
  await manager?.close().catch(()=>{})
  if(web){web.closeResources();web.closeAllConnections();await new Promise(r=>web.close(r))}
  if(server&&!server.exited){server.child.stdin.write('stop\n');await until(()=>server.exited,'server stop',30000).catch(()=>server.child.kill())}
  for(const s of children){
    if(!s.exited){
      if(s.name==='renderer' && process.platform==='win32')await new Promise(r=>execFile('taskkill.exe',['/PID',String(s.child.pid),'/T','/F'],{windowsHide:true},()=>r()))
      else s.child.kill()
    }
    await fs.writeFile(path.join(directory,s.name+'.log'),s.log)
  }
  await writeReport()
}
async function main(){
  if(!process.argv.includes('--live')){console.log('Use --live to start a dedicated natural world, three real Mineflayer players, BlueMap and a hidden Fabric renderer.');return}
  await prepare();report.startedAt=new Date().toISOString()
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown)
  server=launch('minecraft',java,['-Xms512M','-Xmx1536M','-jar',path.join(trial,'server/server-bootstrap.jar'),'nogui'],path.join(directory,'server'))
  await logUntil(server,/Done \(/,0,180000)
  const config={web:{host:'127.0.0.1',port:8090},worldMap:{enabled:true,url:'http://127.0.0.1:8100/',
    playersFile:path.join(directory,'web/maps/natural/live/players.json'),dimension:'minecraft:overworld'},
    renderer:{enabled:true,url:'ws://127.0.0.1:25550',memoryNamespace:'bluemap-natural-20261024',
      outputDir:'runs/bluemap-natural/observations',gameDir:'vendor/stevex-template-1.21.11/run-renderer'},
    agents:roles.map((name,i)=>({name,minecraft:{host:'127.0.0.1',port:25568,version:'1.21.11',username:usernames[i],auth:'offline'},brain:{enabled:false}}))}
  await fs.writeFile(path.join(directory,'agent.json'),JSON.stringify(config,null,2))
  manager=new AgentManager(()=>config);web=startWebServer(manager)
  for(const role of roles)manager.connectAgent(role)
  await until(()=>roles.every(name=>manager.agents.get(name)?.isOnline()),'three players',60000)
  const first=manager.agents.get('Map-A').bot.entity.position
  const previous=await fs.readFile(path.join(directory,'results.json'),'utf8').then(JSON.parse).catch(()=>null)
  const cx=Number.isInteger(previous?.center?.x)?previous.center.x:Math.floor(first.x/16)*16
  const cz=Number.isInteger(previous?.center?.z)?previous.center.z:Math.floor(first.z/16)*16
  report.center={x:cx,z:cz};report.bounds={minX:cx-128,maxX:cx+127,minZ:cz-128,maxZ:cz+127}
  for(const name of usernames)await command(`tag ${name} add stevex_map_trial`)
  await command(`spreadplayers ${cx+0.5} ${cz+0.5} 8 28 false @a[tag=stevex_map_trial]`,/Spread 3 entity/)
  await command(`forceload add ${cx-128} ${cz-128} ${cx+127} ${cz+127}`,/Marked|already marked/)
  for (const [i,name] of usernames.entries()) {
    await command(`item replace entity ${name} armor.chest with ${['diamond_chestplate','golden_chestplate','iron_chestplate'][i]}`)
    await command(`item replace entity ${name} weapon.mainhand with ${['diamond_sword','iron_axe','bow'][i]}`)
    await command(`item replace entity ${name} weapon.offhand with shield`)
  }
  await command('time set noon');await command('weather clear');await command('gamerule advance_time false')
  await command('save-all flush',/Saved the game/)
  const write=(file,text)=>fs.writeFile(path.join(directory,'config',file),text)
  const y=manager.agents.get('Map-A').bot.entity.position.y
  await write('maps/natural.conf',`world: "server/natural-world"\ndimension: "minecraft:overworld"\nname: "Natural world / three players"\nstart-pos: {x: ${cx}, z: ${cz}}\nsky-color: "#7dabff"\nvoid-color: "#dde7ec"\nambient-light: 0.2\nsky-light: 1\nremove-caves-below-y: 55\nrender-mask: [{min-x: ${cx-128}, max-x: ${cx+127}, min-z: ${cz-128}, max-z: ${cz+127}}]\nstorage: "file"\n`)
  await write('webapp.conf',`enabled: true\nwebroot: "web"\nupdate-settings-file: true\nuse-cookies: false\nstart-location: "natural:${cx}:${y}:${cz}:220:0:0.8:0:0:perspective"\nresolution-default: 1\nhires-slider-default: 200\nlowres-slider-default: 500\n`)
  map=launch('bluemap',await mapJava(),['-Xms128M','-Xmx768M','-jar',path.join(trial,jar),'-c','config','-v','1.21.11','-r','-u','-w'],directory)
  launch('renderer','powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/run-renderer.ps1'),'-Server','127.0.0.1:25568'],root,{...process.env,JAVA_HOME:path.dirname(path.dirname(java))})
  await logUntil(server,/SteveXRenderer joined the game/,0,180000)
  await command('op SteveXRenderer',/Made SteveXRenderer|already/)
  await command('gamemode spectator SteveXRenderer')
  await until(()=>manager.renderService.renderer.isConnected(),'Fabric bridge',60000)
  await until(async()=>Boolean((await manager.renderService.status()).state?.spectator),'spectator mode confirmed by client',30000)
  await logUntil(map,/Your maps are now all up-to-date!/,0,240000)
  await sleep(1000)
  const players=await (await fetch('http://127.0.0.1:8100/maps/natural/live/players.json')).json()
  report.players=players
  if(players.players?.length!==3)throw Error('BlueMap did not serve the three player markers')
  for(const [name,perspective] of [['Map-A','first-person'],['Map-A','third-person-back'],['Map-A','third-person-front'],['Map-B','third-person-back'],['Map-C','third-person-front'],['Map-A','first-person']]){
    const result=await manager.captureObservation(name,{perspective})
    if(!result.ok){report.captures.push({name,perspective,error:result.error});await writeReport();continue}
    const frame=result.observation.frame
    const preview=await require('../src/web/server/agent_debug').getDebugStore(manager).rememberObservation(name,result,manager.agents.get(name))
    report.captures.push({name,perspective,preview,frame})
    const png=path.join(directory,'observations',config.renderer.memoryNamespace,frame.agentId,frame.rgb.file)
    await fs.copyFile(png,path.join(directory,`${name}-${perspective}.png`))
    await writeReport()
  }
  report.renderer=await manager.renderService.status()
  report.capturesPassed=report.captures.every(c=>!c.error)
  report.ready=true;await writeReport()
  console.log('READY: http://127.0.0.1:8090/world | Minecraft 127.0.0.1:25568 | Map-A/B/C debug | no paid model')
  // Player markers do not need world saves. Leave terrain updates to vanilla autosave.
  stopTimer=setInterval(async()=>{if(await fs.stat(path.join(directory,'STOP')).catch(()=>null)){await fs.unlink(path.join(directory,'STOP'));await shutdown()}},1000)
}
main().catch(async error=>{console.error(error);report.error=error.message;await shutdown();process.exitCode=1})
