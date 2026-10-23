const fs = require('node:fs')
const path = require('node:path')
const { loadCommands } = require('../src/commands')
const { groupCommands } = require('../src/commands/catalog')

function generate() {
  const escape = value => String(value).replace(/\|/g, '&#124;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, ' ')
  const groups = groupCommands(loadCommands().list)
  return '# Command Catalog\n\nGenerated from src/commands/catalog.js and command definitions. Do not edit manually.\n\nRegenerate: `npm run docs:commands`. Verify: `npm run docs:commands -- --check`.\n\nThis is the full manual/web catalog. LLM default visibility is independent of kind and runtime permissions; explicit allowedCommands replaces the default selection but never grants server permissions. Test results: [API acceptance checklist](api-acceptance-checklist.md).\n\n' + groups.map(group => `## ${group.title} (${group.commands.length})\n\n${group.note}\n\n| Command | Kind | LLM default | Description |\n| --- | --- | --- | --- |\n${group.commands.map(c => `| ${escape(c.usage)} | ${c.kind} | ${c.llmDefaultVisible ? 'visible' : 'hidden'} | ${escape(c.description)} |`).join('\n')}\n`).join('\n')
}
if (require.main === module) {
  const target = path.join(__dirname, '../docs/command-catalog.md')
  const content = generate()
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== content) { console.error('Command catalog is stale; run npm run docs:commands'); process.exitCode = 1 }
  } else fs.writeFileSync(target, content)
}
module.exports = { generate }
