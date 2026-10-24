// Isolated, explicitly requested live test. Never reads agent keys or calls a model.
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn, execFile } = require('node:child_process')
const { promisify } = require('node:util')
const run = promisify(execFile)
const root = path.resolve(__dirname, '..'), directory = path.join(root, 'runs/bluemap-trial')
const java = process.env.JAVA21 || 'C:/Program Files/Java/jdk-21/bin/java.exe'
const jar = 'bluemap-5.29-cli.jar'
const hash = 'e830767fa6364b52b9310fb598508ebde7eec5ebe8360a989e240d991af89a3a'
const delay = ms => new Promise(r => setTimeout(r, ms))
const children = new Map()
const report = { minecraft: '1.21.11', bluemap: '5.29-cli', threads: 1, heapLimitMiB: 768,
  bounds: { minX:-32,maxX:31,minZ:-32,maxZ:31,minY:62,maxY:80 }, samples:[], stages:[], fixture:[] }
async function save() { await fs.writeFile(path.join(directory, 'results.json'), JSON.stringify(report,null,2)) }
async function download(url, file, algorithm, digest) {
  let data
  try { data = await fs.readFile(file) } catch {}
  if (!data || (digest && crypto.createHash(algorithm).update(data).digest('hex') !== digest)) {
    const response = await fetch(url, { signal:AbortSignal.timeout(180000) })
    if (!response.ok) throw Error('Download failed: ' + response.status + ' ' + url)
    data = Buffer.from(await response.arrayBuffer())
    if (digest && crypto.createHash(algorithm).update(data).digest('hex') !== digest) throw Error('Checksum mismatch')
    await fs.writeFile(file, data)
  }
}
function launch(name, args, cwd, executable = java) {
  const child = spawn(executable, args, { cwd, windowsHide:true, stdio:['pipe','pipe','pipe'] })
  const state = { child, log:'', name, started:Date.now() }
  for (const stream of [child.stdout, child.stderr]) stream.on('data', b => { state.log += b; process.stdout.write(`[${name}] ${b}`) })
  child.on('error', error => { state.error = error })
  child.on('exit', code => { state.exited = true; state.exitCode = code })
  children.set(name, state)
  return state
}
async function until(check, label, ms = 120000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await check()) return; await delay(200) }
  throw Error('Timed out: ' + label)
}
async function sample(phase) {
  const active = [...children.values()].filter(s => !s.exited)
  if (!active.length) return
  const ids = active.map(s => s.child.pid).join(',')
  const { stdout } = await run('powershell.exe',['-NoProfile','-Command',
    `Get-Process -Id ${ids} -ErrorAction SilentlyContinue | Select-Object Id,CPU,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`],{windowsHide:true})
  if (!stdout.trim()) return
  for (const p of [JSON.parse(stdout)].flat()) report.samples.push({ phase,at:Date.now(),name:active.find(s=>s.child.pid===p.Id)?.name,
    cpuSeconds:p.CPU,workingMiB:p.WorkingSet64/1048576,privateMiB:p.PrivateMemorySize64/1048576 })
}
async function logUntil(state, pattern, from = 0, ms = 180000) {
  await until(async () => {
    if (state.error) throw state.error
    if (pattern.test(state.log.slice(from))) return true
    if (state.exited) throw Error(`${state.name} exited ${state.exitCode}`)
    return false
  }, `${state.name}: ${pattern}`, ms)
}
async function prepare() {
  await fs.mkdir(path.join(directory,'server'), {recursive:true})
  await download('https://github.com/BlueMap-Minecraft/BlueMap/releases/download/v5.29/' + jar,path.join(directory,jar),'sha256',hash)
  const eula = await fs.readFile(path.join(root,'runs/api-acceptance-server/eula.txt'),'utf8')
  if (!/^eula=true$/m.test(eula)) throw Error('A previously accepted local Minecraft EULA is required')
  const manifest = await (await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')).json()
  const entry = manifest.versions.find(v=>v.id==='1.21.11')
  const version = await (await fetch(entry.url)).json(), server = version.downloads.server
  await download(server.url,path.join(directory,'server/server-bootstrap.jar'),'sha1',server.sha1)
  await fs.writeFile(path.join(directory,'server/eula.txt'),'eula=true\n')
  await fs.writeFile(path.join(directory,'server/server.properties'),[
    'server-ip=127.0.0.1','server-port=25566','online-mode=false','level-name=trial-world',
    'level-type=minecraft:flat','generate-structures=false','view-distance=2','simulation-distance=2',
    'max-players=2','difficulty=peaceful','gamemode=creative','spawn-protection=0','enable-rcon=false','enable-query=false',
    'sync-chunk-writes=true','pause-when-empty-seconds=-1','motd=SteveX isolated BlueMap trial',
  ].join('\n')+'\n')
  const java25 = await mapJava()
  await run(java25,['-jar',jar,'--version'],{cwd:directory,windowsHide:true})
  await fs.mkdir(path.join(directory,'config-trial/maps'),{recursive:true})
  await fs.mkdir(path.join(directory,'config-trial/storages'),{recursive:true})
  const write = (name, text)=>fs.writeFile(path.join(directory,'config-trial',name),text)
  await write('core.conf','accept-download: true\ndata: "data"\nrender-thread-count: 1\nmetrics: false\nscan-for-mod-resources: false\nupdate-cooldown: 5\nregion-file-check-interval: 5\n')
  await write('webserver.conf','enabled: true\nwebroot: "web"\nip: "127.0.0.1"\nport: 8100\n')
  await write('webapp.conf','enabled: true\nwebroot: "web"\nupdate-settings-file: true\nuse-cookies: false\nstart-location: "overworld:0:65:0:65:0:0.8:0:0:perspective"\nresolution-default: 1\nhires-slider-default: 64\nlowres-slider-default: 500\n')
  await write('maps/overworld.conf',`world: "server/trial-world"\ndimension: "minecraft:overworld"\nname: "SteveX model trial"\nstart-pos: {x: 0, z: 0}\nsky-color: "#7dabff"\nvoid-color: "#dde7ec"\nambient-light: 0.2\nsky-light: 1\nremove-caves-below-y: -10000\nrender-mask: [{min-x: -32, max-x: 31, min-z: -32, max-z: 31, min-y: 62, max-y: 80}]\nstorage: "file"\n`)
  await write('storages/file.conf','storage-type: file\nroot: "web/maps"\ncompression: gzip\n')
}
const fixtures = [
  [ -12,64,-6,'smooth_stone_slab[type=bottom]'],[-9,64,-6,'smooth_stone_slab[type=top]'],[-6,64,-6,'smooth_stone_slab[type=double]'],
  [-3,64,-6,'oak_stairs[facing=north,half=bottom]'],[0,64,-6,'oak_stairs[facing=north,half=top]'],
  [3,64,-6,'oak_stairs[facing=east,half=bottom]'],[3,64,-5,'oak_stairs[facing=north,half=bottom]'],
  [7,64,-6,'oak_door[facing=south,half=lower]'],[7,65,-6,'oak_door[facing=south,half=upper]'],
  [11,64,-6,'red_bed[facing=south,part=foot]'],[11,64,-5,'red_bed[facing=south,part=head]'],
  [-12,64,0,'oak_fence'],[-11,64,0,'oak_fence'],[-7,64,0,'glass_pane'],[-6,64,0,'glass_pane'],
  [-2,64,0,'iron_trapdoor[facing=south,open=true,half=bottom]'],[2,64,0,'chest[facing=south]'],
  [6,64,0,'lantern'],[10,64,0,'copper_grate[waterlogged=true]'],
  [-12,64,7,'oak_slab[type=bottom,waterlogged=true]'],[-7,64,7,'water'],[-2,64,7,'glass'],
  [4,64,7,'white_wool'],[9,64,7,'amethyst_cluster[facing=up]'],
]
async function build(server) {
  server.child.stdin.write('forceload add -32 -32 31 31\n')
  await delay(2000)
  const commands = ['time set noon','weather clear','gamerule advance_time false','gamerule spawn_mobs false',
    'fill -24 63 -24 23 63 23 stone','fill -24 64 -24 23 69 23 air']
  for (const [x,y,z,block] of fixtures) commands.push(`setblock ${x} ${y} ${z} ${block}`)
  for (const z of [0,7]) commands.push(`fill -14 64 ${z+1} 12 64 ${z+1} stone`)
  const start = server.log.length
  server.child.stdin.write(commands.join('\n')+'\nsave-all flush\n')
  await logUntil(server,/Saved the game/,start)
  const verifyStart = server.log.length
  for (const [x,y,z,block] of fixtures) server.child.stdin.write(`execute if block ${x} ${y} ${z} ${block} run say BM_OK_${x}_${y}_${z}\n`)
  server.child.stdin.write('say BM_VERIFICATION_FINISHED\n')
  await logUntil(server,/BM_VERIFICATION_FINISHED/,verifyStart)
  report.fixtureVerified = fixtures.filter(([x,y,z])=>server.log.slice(verifyStart).includes(`BM_OK_${x}_${y}_${z}`)).length
  if (report.fixtureVerified !== fixtures.length) throw Error('Fixture changed or did not persist as expected')
  report.fixture = fixtures.map(([x,y,z,block])=>({x,y,z,block}))
  report.fixtureConsoleErrors = server.log.slice(start).split('\n').filter(l=>/Unknown|Incorrect|Invalid|Expected/i.test(l))
  if (report.fixtureConsoleErrors.length) throw Error('Fixture command errors; see report')
}
async function files(dir) {
  const output = []
  for (const e of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[])) {
    const file = path.join(dir,e.name)
    if(e.isDirectory())output.push(...await files(file)); else output.push(file)
  }
  return output
}
async function tileHashes() {
  const output = {}
  for (const file of await files(path.join(directory,'web/maps/overworld/tiles/0'))) {
    if (!file.endsWith('.prbm.gz')) continue
    try { output[path.relative(directory,file)] = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex') }
    catch(error) { if(error.code!=='ENOENT')throw error }
  }
  return output
}
async function main() {
  if (!process.argv.includes('--live')) { console.log('Use --live to download pinned BlueMap and run an isolated Minecraft/BlueMap benchmark. No agents or model calls.'); return }
  await prepare()
  report.startedAt = new Date().toISOString()
  let sampler, browser
  try {
    const server = launch('minecraft',['-Xms256M','-Xmx1G','-jar','server-bootstrap.jar','nogui'],path.join(directory,'server'))
    await logUntil(server,/Done \(/)
    await build(server)
    const start = Date.now(), cachedResources = !!(await fs.stat(path.join(directory,'data/minecraft-client-1.21.11.jar')).catch(()=>null))
    const map = launch('bluemap',['-Xms128M','-Xmx768M','-jar',jar,'-c','config-trial','-v','1.21.11','-r','-u','-w'],directory,await mapJava())
    sampler = setInterval(()=>sample('active').catch(()=>{}),3000)
    await logUntil(map,/Your maps are now all up-to-date!/i,0,240000)
    await until(async()=>Object.keys(await tileHashes()).length>0,'hires model files')
    report.stages.push({name:'initial-render',elapsedMs:Date.now()-start,includesResourceDownload:!cachedResources})
    await delay(3000)
    const tools = path.join(root,'runs/web-inventory-tools/node_modules')
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(tools,'playwright'))
    const { PNG } = require(path.join(tools,'playwright-core/lib/utilsBundle.js'))
    browser = await chromium.launch({channel:'msedge',headless:true})
    const page = await browser.newPage({viewport:{width:1100,height:850}})
    await page.goto('http://127.0.0.1:8100/#overworld:4:64:7:25:0:0.9:0:0:perspective')
    await page.locator('canvas').first().waitFor(); await delay(3000)
    const redPixels = async file => {
      const png = PNG.sync.read(await page.locator('canvas').first().screenshot({path:path.join(directory,file)}))
      let count=0
      for(let i=0;i<png.data.length;i+=4)if(png.data[i]>70 && png.data[i+1]<png.data[i]*0.6 && png.data[i+2]<png.data[i]*0.6)count++
      return count
    }
    const redBefore = await redPixels('update-before.png'), tileResponses=[]
    page.on('response',response=>{if(/\/tiles\/0\/.*\.prbm/.test(response.url()))tileResponses.push({at:Date.now(),url:response.url()})})
    const before = await tileHashes(), changedAt = Date.now(), offset = map.log.length
    const serverOffset = server.log.length
    server.child.stdin.write('setblock 4 64 7 red_wool\nsave-all flush\n')
    await logUntil(server,/Saved the game/,serverOffset)
    const savedAt = Date.now()
    await until(async()=>{
      const now=await tileHashes()
      return Object.keys(before).some(k=>now[k] && now[k]!==before[k])
    },'changed hires model',180000)
    report.stages.push({name:'forced-save-update',commandToModelMs:Date.now()-changedAt,saveToModelMs:Date.now()-savedAt,watchLog:map.log.slice(offset)})
    let redAfter = redBefore
    try {
      await until(async()=>{
        if (!tileResponses.some(r=>r.at>=changedAt)) return false
        redAfter = await redPixels('update-after.png')
        return redAfter>redBefore+5
      },'browser live tile and visible red block',25000)
      report.browserUpdate={confirmed:true,commandToVisibleMs:Date.now()-changedAt,redBefore,redAfter,tileResponses}
    } catch(error) { report.browserUpdate={confirmed:false,error:error.message,redBefore,redAfter,tileResponses} }
    if (!report.browserUpdate.confirmed) throw Error('Browser live update was not confirmed; inspect update evidence')
    await browser.close();browser=null
    clearInterval(sampler)
    await sample('idle-start'); await delay(12000); await sample('idle-end')
    const output=await files(path.join(directory,'web'))
    report.webBytes=(await Promise.all(output.map(async f=>(await fs.stat(f)).size))).reduce((a,b)=>a+b,0)
    report.modelFiles=Object.keys(await tileHashes()).length
    report.downloadSha256=crypto.createHash('sha256').update(await fs.readFile(path.join(directory,jar))).digest('hex')
    report.passed=true
  } finally {
    await browser?.close()
    clearInterval(sampler)
    for(const s of children.values()) {
      if (!s.exited) {
        if(s.name==='minecraft') { s.child.stdin.write('stop\n'); await until(()=>s.exited,'server shutdown',30000).catch(()=>s.child.kill()) }
        else s.child.kill()
      }
      await fs.writeFile(path.join(directory,s.name+'.log'),s.log)
    }
    await save()
  }
}
async function mapJava() {
  if (process.env.BLUEMAP_JAVA) return process.env.BLUEMAP_JAVA
  const folders=await fs.readdir(path.join(directory,'java25'))
  const folder=folders.find(s=>s.startsWith('jdk-'))
  if(!folder)throw Error('Set BLUEMAP_JAVA to a Java 25 java.exe; keep Minecraft on Java 21')
  return path.join(directory,'java25',folder,'bin/java.exe')
}
if(require.main===module)main().catch(async error=>{console.error(error);report.error=error.message;await save();process.exitCode=1})
module.exports={fixtures,directory,java,jar,mapJava}
