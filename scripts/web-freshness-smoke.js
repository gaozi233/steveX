const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path')
const {startPreview}=require('./web-update-smoke')
const {chromium}=require('../runs/web-inventory-tools/node_modules/playwright')
const directory=path.resolve(__dirname,'../runs/web-freshness')
async function main(){
  await fs.mkdir(directory,{recursive:true})
  const preview=await startPreview(0),browser=await chromium.launch({channel:'msedge',headless:true}),report={paidModelCalls:0,minecraftClients:0}
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.goto(preview.origin+'/agents/Preview-A')
    const status=page.locator('[data-agent-freshness]'),inventory=page.locator('[data-inventory-freshness]')
    await status.filter({hasText:'Checked'}).waitFor()
    await page.locator('.inventory-preview summary').click()
    await inventory.filter({hasText:'Checked'}).waitFor()
    const before=await inventory.getAttribute('title')
    await page.waitForFunction(title=>document.querySelector('[data-inventory-freshness]').title!==title,before)
    report.validationTimeAdvances=true
    const inventoryPattern='**/api/agents/Preview-A/inventory-preview'
    await page.route(inventoryPattern,r=>r.fulfill({status:503,json:{ok:false,error:'Simulated unavailable inventory'}}))
    await inventory.filter({hasText:'Last known'}).waitFor()
    await page.locator('.inventory-preview-content [aria-label^="Stone x2"]').waitFor()
    report.inventoryRetainedOnError=true
    await page.unroute(inventoryPattern)
    await page.waitForFunction(()=>document.querySelector('[data-inventory-freshness]').dataset.freshness==='checked')
    const captured='2026-10-25T00:00:00Z',frame='00000000-0000-0000-0000-000000000001'
    const visionPattern='**/api/agents/Preview-A/debug?section=vision'
    let imageRequests=0,failed=false
    await page.route('**/api/agents/Preview-A/observation/*/rgb',r=>{
      imageRequests++
      return r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz1sAAAAASUVORK5CYII=','base64')})
    })
    await page.route(visionPattern,r=>{
      if(failed)return r.fulfill({status:503,json:{ok:false,error:'Simulated inspector failure'}})
      if(r.request().headers()['if-none-match']==='"fixed"')return r.fulfill({status:304,headers:{etag:'"fixed"'}})
      return r.fulfill({headers:{etag:'"fixed"'},json:{ok:true,agentName:'Preview-A',sessionId:'Preview-A-preview',online:true,
        renderer:{enabled:true,connected:false},observation:{frameId:frame,observedAt:captured,width:1,height:1},revision:1}})
    })
    await page.locator('.inspector-vision summary').click()
    await page.locator('[data-vision-image]').waitFor({state:'visible'})
    await page.waitForFunction(()=>document.querySelector('[data-vision-image]').naturalWidth>0)
    const caption=await page.locator('[data-vision-meta]').textContent()
    assert.ok(caption.includes('Captured '+captured))
    await page.waitForTimeout(1500)
    assert.equal(await page.locator('[data-vision-meta]').textContent(),caption)
    report.captureTimeNotRestamped=true
    failed=true
    await page.locator('[data-vision-freshness]').filter({hasText:'Last known'}).waitFor()
    assert.equal(await page.locator('[data-vision-image]').isVisible(),true)
    assert.ok((await page.locator('[data-vision-meta]').textContent()).includes(captured))
    assert.equal(imageRequests,1);report.imageRetainedOnError=true
    await page.screenshot({path:path.join(directory,'last-known-desktop.png')})
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await page.screenshot({path:path.join(directory,'last-known-mobile.png')})
    failed=false
    await page.waitForFunction(()=>document.querySelector('[data-vision-freshness]').dataset.freshness==='checked')
    const statePattern='**/api/status?agent=Preview-A'
    await page.route(statePattern,r=>r.fulfill({status:503,json:{error:'Simulated status failure'}}))
    await status.filter({hasText:'Last known'}).waitFor()
    assert.ok((await page.locator('.health-number').textContent()).includes('20'))
    report.statusRetainedOnError=true
    await page.unroute(statePattern)
    await page.waitForFunction(()=>document.querySelector('[data-agent-freshness]').dataset.freshness==='checked')
    report.errors=errors;assert.deepEqual(errors,[]);report.passed=true
  }finally{await fs.writeFile(path.join(directory,'results.json'),JSON.stringify(report,null,2));await browser.close();await preview.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
