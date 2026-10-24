const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter, once } = require('node:events')
const { WebSocket } = require('ws')
const { createApp } = require('../src/web/server/app')
const { setupWebSocket } = require('../src/web/server/ws')

async function fixture(t) {
  const eventBus = new EventEmitter()
  const agents = new Map(['a', 'b'].map(name => [name, { name, sessionId: name + '-session', isOnline: () => true, config: {}, brainLoop: { getTaskStatus: () => ({ id: name, goal: 'private goal', status: 'paused', limits: { maxCalls: 3 } }) } }]))
  const manager = { eventBus, agents, config: {}, agentConfigs: new Map(), getStatus: () => [...agents.values()].map(a => ({ name: a.name, online: true, currentAction: 'Idle', model: 'fixture', brain: { running: false, task: a.brainLoop.getTaskStatus() } })) }
  const server = createApp(manager).listen(0, '127.0.0.1')
  const wss = setupWebSocket(server, manager)
  await once(server, 'listening')
  t.after(async () => { for (const c of wss.clients) c.terminate(); await new Promise(r => wss.close(r)); server.closeAllConnections(); await new Promise(r => server.close(r)); assert.equal(eventBus.listenerCount('agent:command:done'),0); assert.equal(eventBus.listenerCount('agent:task:update'),0) })
  return { manager, origin: 'http://127.0.0.1:' + server.address().port }
}

test('summary status and deep links omit private tasks, filtered detail and debug sections isolate data', async t => {
  const { manager, origin } = await fixture(t)
  for (const name of ['a','b']) manager.eventBus.emit('agent:llm:input', { name, sessionId: name + '-session', requestId: name, messages: [{ role: 'user', content: name + ' prompt' }] })
  const summary = await (await fetch(origin + '/api/status?view=summary')).json()
  assert.doesNotMatch(JSON.stringify(summary), /private goal|limits|prompt|fixture/)
  assert.equal(summary.agents.length, 2)
  const detail = await (await fetch(origin + '/api/status?agent=a')).json()
  assert.deepEqual(detail.agents.map(a=>a.name), ['a']); assert.equal(detail.agents[0].brain.task.goal, 'private goal')
  assert.equal((await fetch(origin + '/api/status?agent=a&agent=b')).status,400)
  const vision = await (await fetch(origin + '/api/agents/a/debug?section=vision')).json()
  assert.equal(vision.turns, undefined)
  const llm = await (await fetch(origin + '/api/agents/a/debug?section=llm')).json()
  assert.equal(llm.observation, undefined); assert.equal(llm.turns[0].messages[0].content, 'a prompt')
  assert.equal((await fetch(origin + '/api/agents/a/debug?section=bad')).status, 400)
  for (const route of ['/agents','/agents/a','/agents/a%2Fb','/configs']) {
    const response = await fetch(origin + route); assert.equal(response.status, 200); assert.match(await response.text(), /src="\/app.js"/)
  }
})

test('WebSocket defaults to summaries, commands require role subscription and stop after unsubscribe', async t => {
  const { manager, origin } = await fixture(t)
  const baseline = manager.eventBus.listenerCount('agent:command:done')
  const socket = new WebSocket(origin.replace('http:', 'ws:')), messages = []
  socket.on('message', raw => messages.push(JSON.parse(raw.toString())))
  await once(socket, 'open'); await new Promise(r=>setTimeout(r,20))
  assert.doesNotMatch(JSON.stringify(messages), /private goal|limits/)
  const emit = name => manager.eventBus.emit('agent:command:done', { name, command: 'hp', ok: true, output: name + ' result' })
  emit('a'); manager.eventBus.emit('agent:llm:input', { name: 'a', prompt: 'secret prompt', messages: [] })
  await new Promise(r=>setTimeout(r,20)); assert.equal(messages.filter(m=>m.type==='agent:command:done').length, 0)
  socket.send(JSON.stringify({ type: 'subscribe', agent: 'a' })); await once(socket,'message')
  emit('b'); emit('a'); await new Promise(r=>setTimeout(r,20))
  assert.deepEqual(messages.filter(m=>m.type==='agent:command:done').map(m=>m.name), ['a'])
  assert.doesNotMatch(JSON.stringify(messages), /secret prompt/)
  socket.send(JSON.stringify({ type: 'subscribe', agent: null })); await once(socket,'message')
  emit('a'); await new Promise(r=>setTimeout(r,20))
  assert.equal(messages.filter(m=>m.type==='agent:command:done').length, 1)
  socket.close(); await once(socket,'close')
  assert.equal(manager.eventBus.listenerCount('agent:command:done'), baseline)
})

test('paused WebSocket clients receive no updates and resume with a fresh snapshot',async t=>{
  const {manager,origin}=await fixture(t),original=manager.getStatus
  let calls=0
  manager.getStatus=options=>{calls++;return original(options)}
  const socket=new WebSocket(origin.replace('http:','ws:')),messages=[]
  socket.on('message',raw=>messages.push(JSON.parse(raw)))
  await once(socket,'open');await new Promise(r=>setTimeout(r,20))
  socket.send(JSON.stringify({type:'subscribe',agent:null,paused:true}));await once(socket,'message')
  const baseline=calls,count=messages.length
  manager.eventBus.emit('agent:command:done',{name:'a',command:'hp',ok:true,output:'20'})
  await new Promise(r=>setTimeout(r,1100))
  assert.equal(calls,baseline);assert.equal(messages.length,count)
  socket.send(JSON.stringify({type:'subscribe',agent:'a',paused:false}));await once(socket,'message')
  await new Promise(r=>setTimeout(r,30))
  assert.equal(messages.at(-1).type,'snapshot');assert.ok(calls>baseline)
  socket.close();await once(socket,'close')
})
