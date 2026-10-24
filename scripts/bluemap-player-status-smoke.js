const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path')
const {chromium}=require('../runs/web-inventory-tools/node_modules/playwright')
const directory=path.resolve(__dirname,'../runs/bluemap-natural'),report={checks:[]}
async function main(){
  const end=Date.now()+180000
  while(Date.now()<end){try{if((await fetch('http://127.0.0.1:8100/assets/bluemap-player-models/players.json').then(r=>r.json())).length===3)break}catch{}await new Promise(r=>setTimeout(r,500))}
  const players=await(await fetch('http://127.0.0.1:8100/assets/bluemap-player-models/players.json')).json()
  const browser=await chromium.launch({channel:'msedge',headless:true})
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[]
    page.on('pageerror',e=>errors.push(e.message))
    page.on('request',r=>{if(r.url().includes('/api/world-map/players/'))requests.push(r.url())})
    await page.goto('http://127.0.0.1:8090/world');await page.waitForSelector('iframe')
    const frame=page.frames().find(f=>f.url().startsWith('http://127.0.0.1:8100/'))
    await frame.waitForFunction(()=>window.__bpmState?.loadedPlayers.size===3)
    assert.equal(requests.length,0)
    for(const [index,player] of players.entries()){
      await frame.goto(`http://127.0.0.1:8100/#natural:${player.x}:${player.y+1}:${player.z}:10:0:0.8:0:0:perspective`)
      const label=frame.locator(`[data-stevex-player="${player.uuid}"]`)
      await label.click()
      const popup=page.locator('.world-player-popup')
      await popup.getByRole('link',{name:'Open agent debug'}).waitFor()
      for(const field of ['Health','Game Mode','Position','Current Action'])assert.ok((await popup.innerText()).includes(field))
      const agent='Map-'+String.fromCharCode(65+index)
      assert.equal(await popup.locator('a').getAttribute('href'),'/agents/'+agent)
      assert.equal(await popup.locator('strong').textContent(),player.name)
      report.checks.push({player:player.name,agent,text:await popup.innerText()})
      if(index===0){
        await page.screenshot({path:path.join(directory,'player-status-desktop.png')})
        await page.setViewportSize({width:390,height:844})
        await popup.getByRole('button',{name:'Close player status'}).click()
        await label.click();await popup.locator('a').waitFor()
        const bounds=await popup.boundingBox();assert.ok(bounds.x>=0 && bounds.x+bounds.width<=390)
        await page.screenshot({path:path.join(directory,'player-status-mobile.png')})
        await popup.getByRole('button',{name:'Close player status'}).click()
        const count=requests.length;await page.waitForTimeout(1500);assert.equal(requests.length,count)
        report.closedPollingStopped=true
        await page.setViewportSize({width:1440,height:1000})
      } else await popup.getByRole('button',{name:'Close player status'}).click()
    }
    const first=players[0]
    await frame.goto(`http://127.0.0.1:8100/#natural:${first.x}:${first.y+1}:${first.z}:10:0:0.8:0:0:perspective`)
    await frame.locator(`[data-stevex-player="${first.uuid}"]`).press('Enter')
    await page.getByRole('link',{name:'Open agent debug'}).click()
    await page.waitForURL('**/agents/Map-A')
    assert.equal(await page.locator('iframe').count(),0)
    assert.equal(await page.locator('.world-player-popup').count(),0)
    const count=requests.length;await page.waitForTimeout(1500);assert.equal(requests.length,count)
    report.linkNavigated=true;report.errors=errors;assert.deepEqual(errors,[]);report.passed=true
  } finally {await fs.writeFile(path.join(directory,'player-status-results.json'),JSON.stringify(report,null,2));await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
