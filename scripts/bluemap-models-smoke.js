const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict')
const {chromium}=require('../runs/web-inventory-tools/node_modules/playwright')
const {PNG}=require('../runs/web-inventory-tools/node_modules/playwright-core/lib/utilsBundle')
const directory=path.resolve(__dirname,'../runs/bluemap-natural'),report={models:'syrupderg',players:3,measurements:[]}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function command(agent,command){const r=await fetch(`http://127.0.0.1:8090/api/agents/${agent}/command`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command})});const j=await r.json();assert.ok(j.ok,JSON.stringify(j));return j}
async function canvasPixels(frame){
  const png=PNG.sync.read(await frame.locator('canvas').first().screenshot()),colors=new Set()
  for(let i=0;i<png.data.length;i+=4*97)colors.add(`${png.data[i]>>3},${png.data[i+1]>>3},${png.data[i+2]>>3}`)
  assert.ok(colors.size>100,'World canvas must contain varied, nonblank rendered pixels')
  return {width:png.width,height:png.height,sampledColors:colors.size}
}
async function main(){
  if(process.argv.includes('--verify-only'))Object.assign(report,JSON.parse(await fs.readFile(path.join(directory,'models-browser-results.json'))))
  delete report.passed
  const browser=await chromium.launch({channel:'msedge',headless:true})
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[]
    const browserSession=await browser.newBrowserCDPSession()
    const system=await browserSession.send('SystemInfo.getInfo')
    report.gpu=system.gpu.devices
    page.on('pageerror',e=>errors.push(e.message))
    const players=await(await fetch('http://127.0.0.1:8100/assets/bluemap-player-models/players.json')).json()
    assert.equal(players.length,3);report.appearance=players
    const center=players.reduce((a,p)=>({x:a.x+p.x/3,y:a.y+p.y/3,z:a.z+p.z/3}),{x:0,y:0,z:0})
    const hash=`#natural:${center.x}:${center.y}:${center.z}:40:0:0.8:0:0:perspective`
    for(const mode of process.argv.includes('--verify-only')?[]:['markers','models']) {
      const p=await context.newPage()
      if(mode==='markers')await p.route('**/assets/bluemap-player-models/player-models.js',r=>r.fulfill({contentType:'text/javascript',body:''}))
      await p.goto('http://127.0.0.1:8100/'+hash)
      await p.waitForFunction(()=>window.bluemap?.mapViewer?.map)
      if(mode==='models')await p.waitForFunction(()=>window.__bpmState?.loadedPlayers?.size===3)
      await p.waitForTimeout(8000)
      const sample=await p.evaluate(async()=>{
        const times=[];let previous
        const renderer=window.bluemap.mapViewer.renderer
        const start=performance.now()
        await new Promise(resolve=>{function tick(now){window.bluemap.mapViewer.redraw();if(previous)times.push(now-previous);previous=now;if(now-start<10000)requestAnimationFrame(tick);else resolve()}requestAnimationFrame(tick)})
        times.sort((a,b)=>a-b)
        renderer.info.autoReset=false;renderer.info.reset();window.bluemap.mapViewer.render(16)
        const info={memory:{...renderer.info.memory},render:{...renderer.info.render}}
        renderer.info.autoReset=true
        return {frames:times.length,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],
          renderer:info,jsHeapMiB:performance.memory?.usedJSHeapSize/1048576,
          avatars:window.__bpmState?.loadedPlayers.size||0}
      })
      report.measurements.push({mode,viewport:'1440x1000',...sample})
      await p.screenshot({path:path.join(directory,'models-'+mode+'.png')})
      if(mode==='models')report.geometry=await p.evaluate(()=>[...window.__bpmState.loadedPlayers.values()].map(i=>({
        name:i.data.name,skin:Boolean(i.baseMaterial.map?.image?.width),visible:i.parts.root.visible,
        equipment:Object.fromEntries(Object.entries(i.parts.equipGroups).map(([k,g])=>[k,g.children.length]))})))
      await p.close()
    }
    await page.goto('http://127.0.0.1:8090/world')
    await page.waitForSelector('iframe')
    const frame=page.frames().find(f=>f.url().startsWith('http://127.0.0.1:8100/'))
    await frame.waitForFunction(()=>window.__bpmState?.loadedPlayers.size===3)
    await command('Map-A','sneak on');await sleep(1500)
    await frame.waitForFunction(()=>[...window.__bpmState.loadedPlayers.values()].some(i=>i.data.name==='SteveX-MapA'&&i.data.crouching))
    report.crouching=true
    report.crouchPose=await frame.evaluate(()=>{const i=[...window.__bpmState.loadedPlayers.values()].find(i=>i.data.name==='SteveX-MapA');return {rootY:i.parts.root.position.y,bodyRotation:i.parts.torso.rotation.x}})
    assert.ok(report.crouchPose.bodyRotation>0.3)
    await frame.goto('http://127.0.0.1:8100/'+`#natural:${players[0].x}:${players[0].y+1}:${players[0].z}:7:0:1.2:0:0:perspective`)
    await frame.waitForFunction(()=>window.__bpmState?.loadedPlayers.size===3)
    await page.waitForTimeout(2000)
    await page.locator('iframe').screenshot({path:path.join(directory,'models-player-close.png')})
    await command('Map-A','sneak off')
    report.moving=false
    for(const direction of ['back','left','right']) {
      const movement=command('Map-A',`move ${direction} 2000`)
      for(let i=0;i<10;i++) {
        const data=await(await fetch('http://127.0.0.1:8100/assets/bluemap-player-models/players.json')).json()
        if(data.find(p=>p.name==='SteveX-MapA')?.moving) {report.moving=true;break}
        await sleep(250)
      }
      await movement
      if(report.moving)break
    }
    assert.ok(report.moving,'Actual player displacement must reach the appearance feed')
    await command('Map-A','move stop');await command('Map-A','sneak off')
    await page.screenshot({path:path.join(directory,'models-world-desktop.png')})
    report.desktopCanvas=await canvasPixels(frame)
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1000)
    await page.screenshot({path:path.join(directory,'models-world-mobile.png')})
    report.mobileCanvas=await canvasPixels(frame)
    report.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
    // Exercise our visibility handler deterministically; not a physical display-vsync measurement.
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))})
    await page.waitForFunction(()=>document.querySelector('iframe').src==='about:blank')
    report.backgroundUnloaded=true
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))})
    await page.waitForFunction(()=>document.querySelector('iframe').src.startsWith('http://127.0.0.1:8100/'))
    const resumed=page.frames().find(f=>f.url().startsWith('http://127.0.0.1:8100/'))
    await resumed.waitForFunction(()=>window.__bpmState?.loadedPlayers.size===3)
    report.resumeLoaded=true
    await page.route('**/assets/bluemap-player-models/players.json?*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(players.map(p=>({...p,observedAt:Date.now()-10000})))}))
    await resumed.waitForFunction(()=>window.__bpmState?.loadedPlayers.size===0)
    report.expiredCleared=true
    await page.unroute('**/assets/bluemap-player-models/players.json?*')
    await page.locator('a[href="/agents"]').first().click()
    await page.waitForTimeout(1200)
    report.afterNavigationFrames=page.frames().length
    assert.equal(report.afterNavigationFrames,1)
    report.errors=errors;assert.deepEqual(errors,[])
    assert.ok(report.geometry.every(p=>p.skin && p.visible && p.equipment.mainHand && p.equipment.offHand && p.equipment.torso))
    report.passed=true
  } finally {
    await command('Map-A','move stop').catch(()=>{});await command('Map-A','sneak off').catch(()=>{})
    await fs.writeFile(path.join(directory,'models-browser-results.json'),JSON.stringify(report,null,2));await browser.close()
  }
}
main().catch(e=>{console.error(e);process.exitCode=1})
