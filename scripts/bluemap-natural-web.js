const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path')
const {chromium}=require(path.resolve(__dirname,'../runs/web-inventory-tools/node_modules/playwright'))
const output=path.resolve(__dirname,'../runs/bluemap-natural'),origin='http://127.0.0.1:8090'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function json(url,body){const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json();assert.ok(r.ok&&d.ok!==false,JSON.stringify(d));return d}
async function main(){
  let browser
  const report={errors:[],requests:[],steps:[]}
  try{
    browser=await chromium.launch({channel:'msedge',headless:true})
    const page=await browser.newPage({viewport:{width:1440,height:1000}})
    page.on('pageerror',e=>report.errors.push(e.message))
    page.on('request',r=>{if(r.method()==='POST')report.requests.push({url:r.url(),body:r.postData()})})
    await page.goto(origin+'/world')
    const map=page.frameLocator('iframe.world-frame')
    await map.locator('.bm-marker-player').nth(2).waitFor({timeout:30000})
    const names=await map.locator('.bm-player-name').allTextContents()
    assert.deepEqual([...names].sort(),['SteveX-MapA','SteveX-MapB','SteveX-MapC'])
    report.markers=names
    await page.screenshot({path:path.join(output,'natural-world.png'),fullPage:true})
    const players=()=>json('http://127.0.0.1:8100/maps/natural/live/players.json')
    const before=(await players()).players.find(p=>p.name==='SteveX-MapA')
    await json(origin+'/api/agents/Map-A/command',{command:'move back 500'})
    await sleep(1500)
    const after=(await players()).players.find(p=>p.name==='SteveX-MapA')
    report.markerMotion={before,after,distance:Math.hypot(after.position.x-before.position.x,after.position.z-before.position.z)}
    assert.ok(report.markerMotion.distance>0.1,'Player marker must follow actual movement')
    await page.goto(origin+'/agents/Map-A')
    await page.locator('.inspector-vision > summary').click()
    await page.locator('[data-inspect-capture]:not([disabled])').waitFor({timeout:15000})
    for(const perspective of ['third-person-back','third-person-front','first-person']){
      report.steps.push({before:await page.locator('[data-vision-perspective]').inputValue(),active:await page.evaluate(()=>document.activeElement.tagName)})
      await page.keyboard.press('F5')
      await page.waitForTimeout(500)
      report.steps.push({after:await page.locator('[data-vision-perspective]').inputValue(),status:await page.locator('[data-vision-status]').textContent()})
      try{await page.waitForFunction(p=>document.querySelector('[data-vision-meta]')?.textContent.includes(p)&&!document.querySelector('[data-inspect-capture]').disabled,perspective,{timeout:25000})}
      catch(error){report.failureState=await page.locator('.inspector-vision').innerText();throw error}
      await page.screenshot({path:path.join(output,`debug-${perspective}.png`),fullPage:true})
    }
    report.f5Cycle=true
    await json(origin+'/api/agents/Map-A/command',{command:'right down off-hand'})
    await json(origin+'/api/agents/Map-A/command',{command:'sneak on'})
    const captured=await json(origin+'/api/agents/Map-A/observe',{perspective:'third-person-front'})
    const rgb=await fetch(origin+captured.preview.rgbUrl)
    await fs.writeFile(path.join(output,'Map-A-shield-sneak.png'),Buffer.from(await rgb.arrayBuffer()))
    report.shieldSneak={perspective:captured.preview.perspective,previewOnly:captured.preview.previewOnly}
    await json(origin+'/api/agents/Map-A/command',{command:'right up'})
    await json(origin+'/api/agents/Map-A/command',{command:'sneak off'})
    assert.deepEqual(report.errors,[])
    report.passed=true
  }finally{
    await browser?.close()
    await fs.writeFile(path.join(output,'web-results.json'),JSON.stringify(report,null,2))
  }
  console.log(JSON.stringify(report,null,2))
}
main().catch(error=>{console.error(error);process.exitCode=1})
