const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs/promises')
const { createApp } = require('../src/web/server/app')
const { setupWebSocket } = require('../src/web/server/ws')

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
  const makeAgent = (name, itemName) => {
    const slots = Array(46).fill(null)
    const item = (name, count = 1) => ({ name, count, displayName: name.replaceAll('_', ' ') })
    slots[9] = item(itemName, 32)
    slots[36] = { ...item('diamond_sword'), components: [{ type: 'enchantments', data: [{ name: 'sharpness', level: 3 }, { name: 'unbreaking', level: 2 }] }] }
    slots[5] = { ...item('iron_helmet'), durabilityUsed: 25, maxDurability: 165 }
    slots[45] = item('shield')
    return { name, sessionId: name + '-1', online: true, isOnline() { return this.online }, bot: {
      version: '1.21.11', quickBarSlot: 0, inventory: { slots },
      getEquipmentDestSlot: destination => ({ head: 5, torso: 6, legs: 7, feet: 8, 'off-hand': 45 })[destination]
    } }
  }
  const a = makeAgent('Agent-A', 'apple'), b = makeAgent('Agent-B', 'diamond')
  const manager = { agents: new Map([[a.name, a], [b.name, b]]), eventBus: new EventEmitter(),
    getStatus: () => [a, b].map(agent => ({ name: agent.name, online: agent.online, username: agent.name, health: 20, maxHealth: 20 })) }
  const server = createApp(manager).listen(0, '127.0.0.1')
  const wss = setupWebSocket(server, manager)
  await new Promise(resolve => server.once('listening', resolve))
  let browser
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const requests = new Map()
    page.on('request', request => {
      if (request.url().includes('/inventory-preview')) {
        assert.equal(request.method(), 'GET')
        requests.set(request.url(), (requests.get(request.url()) || 0) + 1)
      }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.locator('.agent-card').first().waitFor()
    assert.equal(await page.locator('.empty-state').count(), 0)
    assert.equal(await page.locator('.command-catalog').count(), 0)
    const panel = name => page.locator(`[data-agent-name="${name}"] .inventory-preview`)
    const pa = panel(a.name), pb = panel(b.name)
    await pa.locator('summary').click()
    await pb.locator('summary').click()
    await page.waitForFunction(() => document.querySelectorAll('.inventory-preview .inventory-grid').length === 4)
    assert.match(await pa.locator('.inventory-grid .inventory-slot').first().getAttribute('aria-label'), /apple x32/)
    assert.doesNotMatch(await pa.locator('.inventory-grid .inventory-slot').first().getAttribute('aria-label'), /diamond/)
    assert.match(await pb.locator('.inventory-grid .inventory-slot').first().getAttribute('aria-label'), /diamond x32/)
    assert.equal(await pa.locator('.inventory-equipment .inventory-slot').count(), 5)
    assert.equal(await pa.locator('.inventory-grid .inventory-slot').count(), 36)
    await page.waitForFunction(() => document.querySelectorAll('.inventory-slot.has-texture').length >= 4)
    const sword = pa.locator('.inventory-hotbar .inventory-slot').first()
    await sword.hover()
    const tooltip = page.locator('[role="tooltip"]')
    await tooltip.waitFor({ state: 'visible' })
    assert.match(await tooltip.textContent(), /sharpness 3/)
    assert.match(await tooltip.textContent(), /unbreaking 2/)
    // Keep the mouse stationary while unrelated slots force repeated full refreshes.
    for (const count of [30, 29, 28]) {
      a.bot.inventory.slots[9].count = count
      await page.waitForFunction(count => document.querySelector('[data-agent-name="Agent-A"] .inventory-grid .inventory-slot')?.getAttribute('aria-label').includes(`x${count}\n`), count)
      assert.equal(await tooltip.isVisible(), true)
      assert.match(await tooltip.textContent(), /sharpness 3/)
    }
    await sword.focus()
    assert.equal(await tooltip.isVisible(), true)
    await sword.press('Escape')
    assert.equal(await tooltip.isVisible(), false)
    // Unknown textures remain legible rather than producing an empty slot.
    a.bot.inventory.slots[10] = { name: 'unknown_test_item', count: 1 }
    await page.waitForFunction(() => [...document.querySelectorAll('[data-agent-name="Agent-A"] .item-fallback')].some(el => el.textContent === 'unknown test item'))
    const windowSlots = Array(63).fill(null)
    windowSlots[0] = { name: 'coal', count: 8 }
    a.bot.currentWindow = { id: 3, type: 'minecraft:generic_9x3', inventoryStart: 27, inventoryEnd: 63, slots: windowSlots }
    await page.waitForFunction(() => document.querySelector('[data-agent-name="Agent-A"] .inventory-window-title')?.textContent.includes('#3'))
    assert.equal(await pa.locator('.inventory-grid .inventory-slot').count(), 63)
    assert.equal(await pb.locator('.inventory-window-title').count(), 0)
    await fs.mkdir('runs/web-inventory-smoke', { recursive: true })
    await page.screenshot({ path: 'runs/web-inventory-smoke/desktop.png', fullPage: true })
    // Furnace layouts use the same window-local slots, not guessed chest slots.
    a.bot.currentWindow = { id: 4, type: 'minecraft:furnace', inventoryStart: 3, inventoryEnd: 39, slots: Array(39).fill(null) }
    await page.waitForFunction(() => document.querySelector('[data-agent-name="Agent-A"] .inventory-window-title')?.textContent.includes('furnace'))
    assert.equal(await pa.locator('.inventory-grid .inventory-slot').count(), 39)
    a.bot.currentWindow = null
    a.online = false
    await page.waitForFunction(() => document.querySelector('[data-agent-name="Agent-A"] .inventory-preview-content')?.textContent === 'Agent offline')
    assert.equal(await pa.locator('.inventory-slot').count(), 0)
    a.online = true
    a.sessionId = 'Agent-A-2'
    await page.waitForFunction(() => document.querySelectorAll('[data-agent-name="Agent-A"] .inventory-slot').length > 0)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: 'runs/web-inventory-smoke/mobile.png', fullPage: true })
    const overflow = await pa.evaluate(el => [...el.querySelectorAll('.inventory-slot')].some(slot => slot.getBoundingClientRect().right > innerWidth))
    assert.equal(overflow, false)
    // Closing a panel cancels polling, while the other agent continues independently.
    await pa.locator('summary').click()
    await page.waitForTimeout(200)
    const aUrl = [...requests.keys()].find(url => url.includes('/Agent-A/'))
    const before = requests.get(aUrl)
    await page.waitForTimeout(1400)
    assert.equal(requests.get(aUrl), before)
    // Late responses from an earlier expansion cannot overwrite a reopened panel.
    let releaseOld, captured
    const capturedRequest = new Promise(resolve => { captured = resolve })
    await page.route('**/api/agents/Agent-A/inventory-preview', async route => {
      const old = JSON.parse(await (await route.fetch()).text())
      old.storage[0].item = { name: 'stale_marker', count: 1 }
      captured()
      await new Promise(resolve => { releaseOld = resolve })
      await route.fulfill({ json: old }).catch(() => {})
    }, { times: 1 })
    await pa.locator('summary').click()
    await capturedRequest
    await pa.locator('summary').click()
    await pa.locator('summary').click()
    await page.waitForFunction(() => document.querySelector('[data-agent-name="Agent-A"] .inventory-grid .inventory-slot')?.getAttribute('aria-label').includes('apple'))
    releaseOld()
    await page.waitForTimeout(200)
    assert.doesNotMatch(await pa.textContent(), /stale marker/)
    // Item display names/data are untrusted text, not markup.
    a.bot.inventory.slots[9].displayName = '<img src=x onerror=alert(1)>'
    await page.waitForFunction(() => document.querySelector('[data-agent-name="Agent-A"] .inventory-grid .inventory-slot')?.getAttribute('data-tooltip').includes('<img'))
    assert.equal(await pa.locator('img[onerror]').count(), 0)
    // A response routed to the wrong agent must clear contents, never display them.
    await page.route('**/api/agents/Agent-A/inventory-preview', route => route.fulfill({ json: { ok: true, agentName: 'Agent-B', online: true } }), { times: 1 })
    await page.waitForFunction(() => document.querySelector('[data-agent-name="Agent-A"] .inventory-preview-content')?.textContent === 'Agent identity mismatch')
    assert.equal(await pa.locator('.inventory-slot').count(), 0)
    assert.deepEqual(errors, [])
    console.log('PASS: dual-agent isolation, read-only requests, storage/equipment/offhand, icons/fallback, chest/furnace, offline/reconnect, mobile, polling cleanup, stale responses, HTML escaping, wrong-agent rejection; screenshots in runs/web-inventory-smoke')
  } finally {
    await browser?.close()
    for (const client of wss.clients) client.terminate()
    await new Promise(resolve => wss.close(resolve))
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
