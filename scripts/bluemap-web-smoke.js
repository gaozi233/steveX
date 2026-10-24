// Real BlueMap tiles in the production World page; no mock map or model calls.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises'),path = require('node:path')
const { directory } = require('./bluemap-trial')
const tools=path.resolve(__dirname,'../runs/web-inventory-tools/node_modules')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(tools,'playwright'))
const { PNG } = require(path.join(tools,'playwright-core/lib/utilsBundle.js'))
function pixelStats(buffer) {
  const png=PNG.sync.read(buffer), colors=new Set();let varied=0
  for(let i=0;i<png.data.length;i+=4*17) {
    const r=png.data[i],g=png.data[i+1],b=png.data[i+2]
    colors.add((r>>4)*256+(g>>4)*16+(b>>4))
    if(Math.max(r,g,b)-Math.min(r,g,b)>30)varied++
  }
  return {width:png.width,height:png.height,colors:colors.size,varied}
}
async function main() {
  let browser
  const report={errors:[],requests:[],screenshots:[]}
  try {
    browser=await chromium.launch({channel:'msedge',headless:true})
    const page=await browser.newPage({viewport:{width:1440,height:1000}})
    page.on('pageerror',e=>report.errors.push(e.message))
    page.on('request',r=>report.requests.push({url:r.url(),method:r.method()}))
    await page.goto('http://127.0.0.1:8090/agents')
    await page.waitForTimeout(500)
    assert.equal(report.requests.some(r=>r.url.includes(':8100')),false,'Agents must not load the map')
    await page.getByRole('link',{name:'World',exact:true}).click()
    await page.waitForSelector('iframe.world-frame')
    const frame=page.frameLocator('iframe.world-frame')
    await frame.locator('canvas').first().waitFor()
    await page.waitForTimeout(3500)
    const cameraBefore=await frame.locator('body').evaluate(()=>window.bluemap.mapViewer._camera.position.toArray())
    const box=await frame.locator('canvas').first().boundingBox()
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2)
    await page.mouse.wheel(0,-180);await page.waitForTimeout(600)
    const cameraAfter=await frame.locator('body').evaluate(()=>window.bluemap.mapViewer._camera.position.toArray())
    assert.notDeepEqual(cameraBefore,cameraAfter,'3D camera responds to zoom input')
    report.cameraInteraction={cameraBefore,cameraAfter}
    report.mapInfo=await frame.locator('body').evaluate(body=>({text:body.innerText.slice(0,1000),globals:Object.keys(window).filter(k=>/blue|map/i.test(k))}))
    for(const size of [{width:1440,height:1000},{width:390,height:844}]) {
      await page.setViewportSize(size);await page.waitForTimeout(500)
      const canvas=frame.locator('canvas').first(),pixels=pixelStats(await canvas.screenshot())
      const file=path.join(directory,`world-${size.width}.png`)
      await page.screenshot({path:file,fullPage:true})
      report.screenshots.push({viewport:size,...pixels,file:path.basename(file)})
      assert.ok(pixels.colors>20 && pixels.varied>100,'Rendered canvas must contain terrain, not just an empty background: '+JSON.stringify(pixels))
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow')
    }
    await page.getByRole('link',{name:'Agents',exact:true}).click()
    await page.waitForTimeout(1000)
    const start=report.requests.length
    await page.waitForTimeout(2200)
    assert.equal(report.requests.slice(start).some(r=>r.url.includes(':8100')),false,'Map traffic must stop after leaving World')
    assert.equal(await page.locator('iframe.world-frame').count(),0)
    assert.equal(report.requests.some(r=>r.method!=='GET'),false,'Viewing the map must not send world-changing actions')
    assert.deepEqual(report.errors,[])
    const models=await browser.newPage({viewport:{width:1200,height:900}})
    for(const [name,anchor] of [
      ['slabs-stairs','overworld:-7:64:-6:14:0.4:0.85:0:0:perspective'],
      ['door-bed','overworld:9:65:-6:12:0.4:0.85:0:0:perspective'],
      ['fence-water','overworld:-2:65:1:23:0.4:0.85:0:0:perspective'],
    ]) {
      await models.goto('http://127.0.0.1:8100/#'+anchor)
      await models.locator('canvas').first().waitFor();await models.waitForTimeout(1800)
      await models.screenshot({path:path.join(directory,name+'.png')})
    }
    report.passed=true
  } finally {await browser?.close();await fs.writeFile(path.join(directory,'web-results.json'),JSON.stringify(report,null,2))}
  console.log(JSON.stringify(report,null,2))
}
main().catch(error=>{console.error(error);process.exitCode=1})
