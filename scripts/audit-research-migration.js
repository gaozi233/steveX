const { execFileSync } = require('node:child_process')
const path = require('node:path')

const reference = 'archive/research-visual-world-model-2026-10-21'
function tree(dir) {
  const output = execFileSync('git', ['ls-tree', '-r', '--name-only', reference, '--', dir],
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' })
  return output.trim().split('\n').filter(Boolean)
}

const fs = require('node:fs')
const root = path.resolve(__dirname, '..')
let failed = false
for (const dir of ['vendor/stevex-template-1.21.11/src/main/java',
  'vendor/stevex-test-template-1.21.11/src/main/java', 'src/nbt', 'tools']) {
  const files = tree(dir)
  const missing = files.filter(file => !fs.existsSync(path.join(root, file)))
  console.log(JSON.stringify({ reference, directory: dir, originalFiles: files.length, missing }))
  if (missing.length) failed = true
}
process.exitCode = failed ? 1 : 0
