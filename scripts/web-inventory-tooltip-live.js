const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(root, 'runs/web-inventory-tools/node_modules/playwright'))
const rcon = command => execFileSync(process.execPath, [path.join(root, 'runs/api-acceptance-server/rcon.cjs'), command], { encoding: 'utf8', timeout: 10000 }).trim()

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  let originalCount
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:8091')
    for (const name of ['Web-A', 'Web-B']) await page.locator(`[data-agent-name="${name}"] .inventory-preview summary`).click()
    const sword = page.locator('[data-agent-name="Web-A"] .inventory-slot[data-tooltip^="Diamond Sword x1"]')
    await sword.hover()
    const tooltip = page.locator('[role="tooltip"]')
    await tooltip.waitFor({ state: 'visible' })
    assert.match(await tooltip.textContent(), /sharpness 3/)
    assert.match(await tooltip.textContent(), /unbreaking 2/)
    const response = await fetch('http://127.0.0.1:8091/api/agents/Web-A/inventory-preview')
    const data = await response.json()
    assert.equal(data.container.type, 'minecraft:furnace')
    originalCount = data.container.slots[2].item?.count ?? 0
    for (const count of [11, 12, 13]) {
      rcon(`item replace block 8122 100 8122 container.2 with iron_ingot ${count}`)
      await page.waitForFunction(count => [...document.querySelectorAll('[data-agent-name="Web-A"] .inventory-sections section:last-child .inventory-slot')].some(el => el.getAttribute('aria-label')?.startsWith(`Iron Ingot x${count}\n`)), count)
      assert.equal(await tooltip.isVisible(), true)
      assert.match(await tooltip.textContent(), /sharpness 3/)
    }
    await fs.mkdir(path.join(root, 'runs/web-inventory-live'), { recursive: true })
    await page.screenshot({ path: path.join(root, 'runs/web-inventory-live/tooltip-enchanted-sword.png') })
    await page.locator('[data-agent-name="Web-A"] .inventory-slot[data-tooltip^="Enchanted Book x1"]').hover()
    assert.match(await tooltip.textContent(), /Stored enchantments:\n  mending 1/)
    await page.locator('[data-agent-name="Web-B"] .inventory-slot[data-tooltip^="Netherite Sword x1"]').hover()
    assert.match(await tooltip.textContent(), /smite 4/)
    assert.doesNotMatch(await tooltip.textContent(), /sharpness 3/)
    await sword.focus()
    assert.match(await tooltip.textContent(), /sharpness 3/)
    await sword.press('Escape')
    assert.equal(await tooltip.isVisible(), false)
    await page.setViewportSize({ width: 390, height: 844 })
    await sword.focus()
    // Escape preserves focus, so move focus away and back to emulate a fresh keyboard visit.
    await sword.press('Tab')
    await sword.focus()
    const bounds = await tooltip.boundingBox()
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390)
    assert.deepEqual(errors, [])
    console.log('PASS: real enchanted sword/book, 3 server furnace refreshes without moving mouse, cross-agent tooltip switch, focus/Escape, narrow-screen bounds')
  } finally {
    if (originalCount !== undefined) rcon(`item replace block 8122 100 8122 container.2 with ${originalCount ? `iron_ingot ${originalCount}` : 'air'}`)
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
