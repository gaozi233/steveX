const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
function testFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry => {
    const file=path.join(directory,entry.name)
    return entry.isDirectory()?testFiles(file):entry.isFile()&&entry.name.endsWith('.test.js')?[file]:[]
  })
}
if(require.main===module){
  const files=testFiles(path.join(root,'test'))
  if(!files.length)throw Error('No tests found in test/')
  const result=spawnSync(process.execPath,['--test',...process.argv.slice(2),...files],{cwd:root,stdio:'inherit'})
  if(result.error)throw result.error
  process.exitCode=result.status??1
}
module.exports={testFiles}
