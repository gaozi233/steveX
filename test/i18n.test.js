const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../src/web/public/lib/i18n.js'), 'utf8').replace(/^export /gm, '')
const context = vm.createContext({})
vm.runInContext(source, context)

test('zh translation replaces whole labels only and keeps surrounding whitespace', () => {
  assert.equal(context.translate('Health', 'zh'), '生命值')
  assert.equal(context.translate('LLM Planner', 'zh'), 'LLM 规划器')
  assert.equal(context.translate('Command', 'zh'), '命令')
  assert.equal(context.translate('  Command  ', 'zh'), '  命令  ')
  assert.equal(context.translate('Health', 'en'), 'Health')
  assert.equal(context.translate('Position: 1 2 3', 'zh'), 'Position: 1 2 3')
  assert.equal(context.translate('unknown label', 'zh'), 'unknown label')
  assert.equal(context.translate(undefined, 'zh'), undefined)
})

test('every label key still appears verbatim in the front-end sources', () => {
  const root = path.join(__dirname, '../src/web/public')
  const files = []
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(js|html)$/.test(entry.name)) files.push(full)
    }
  }
  walk(root)
  const haystack = files.map(file => fs.readFileSync(file, 'utf8')).join('\n')
  const labels = vm.runInContext('LABELS', context)
  const missing = Object.keys(labels).filter(key => !haystack.includes(key))
  assert.deepEqual(missing, [], 'labels no longer present in markup: ' + missing.join(', '))
})

test('language switch stores the choice and reloads instead of translating backwards', () => {
  const stored = []
  const ctx = vm.createContext({
    localStorage: { getItem: () => null, setItem: (key, value) => stored.push([key, value]) },
    location: { reload() { ctx.reloaded = true } },
    navigator: { language: 'zh-CN' }
  })
  vm.runInContext(source, ctx)
  assert.equal(ctx.initLang(), 'zh')
  assert.equal(ctx.getLang(), 'zh')
  ctx.setLang('en')
  assert.deepEqual(stored, [['stevex.lang', 'en']])
  assert.equal(ctx.reloaded, true)
  assert.equal(ctx.setLang('fr'), false)
})
