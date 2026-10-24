// Serves the previously generated trial map and the actual SteveX World page.
// No Minecraft client, agent, renderer, model, or credentials are started.
const { spawn } = require('node:child_process')
const { AgentManager } = require('../src/agent/agent_manager')
const { startWebServer } = require('../src/web/server')
const { directory, jar, mapJava } = require('./bluemap-trial')

async function main() {
  const map=spawn(await mapJava(),['-Xms128M','-Xmx768M','-jar',jar,'-c','config-trial','-v','1.21.11','-w'],{cwd:directory,windowsHide:true,stdio:['ignore','pipe','pipe']})
  map.stdout.pipe(process.stdout);map.stderr.pipe(process.stderr)
  const manager=new AgentManager(()=>({agents:[],renderer:{enabled:false},web:{host:'127.0.0.1',port:8090},worldMap:{enabled:true,url:'http://127.0.0.1:8100/'}}))
  const server=startWebServer(manager)
  let closing=false
  async function close() {
    if(closing)return;closing=true
    map.kill();await manager.close();server.closeResources();server.closeAllConnections();server.close()
  }
  map.on('error',error=>{console.error(error);close()})
  map.on('exit',()=>close())
  server.on('error',error=>{console.error(error);close()})
  process.on('SIGINT',close);process.on('SIGTERM',close)
  console.log('Human World viewer: http://127.0.0.1:8090/world (saved trial map only)')
}
main().catch(error=>{console.error(error);process.exitCode=1})
