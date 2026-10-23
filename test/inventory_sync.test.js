const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const {syncWindow}=require('../src/commands/inventory_sync')
function fixture(){const bot=new EventEmitter();bot.version='1.21.11';bot.registry=require('minecraft-data')(bot.version);bot.supportFeature=()=>true;bot.inventory={id:0,slots:[],selectedItem:null};bot._client=new EventEmitter();bot._client.write=()=>{};return bot}
function clean(bot){assert.equal(bot.listenerCount('setWindowItems:0'),0);assert.equal(bot.listenerCount('end'),0);assert.equal(bot.listenerCount('windowClose'),0);assert.equal(bot._client.listenerCount('respawn'),0)}
test('inventory snapshot timeout cleans all owned listeners and allows a later request',async()=>{
 const bot=fixture();await assert.rejects(syncWindow(bot,bot.inventory,{timeoutMs:10}),{code:'INVENTORY_SYNC_TIMEOUT'});clean(bot)
 let sent;bot._client.write=(name,data)=>{sent={name,...data};queueMicrotask(()=>bot.emit('setWindowItems:0'))}
 await syncWindow(bot,bot.inventory);assert.equal(sent.stateId,-1);assert.equal(sent.slot,-999);clean(bot)
})
test('inventory synchronization abort, disconnect and respawn settle without leaked listeners',async()=>{
 for(const mode of ['abort','end','respawn','close']){const bot=fixture(),c=new AbortController(),pending=syncWindow(bot,bot.inventory,{signal:c.signal});if(mode==='abort')c.abort();else if(mode==='respawn')bot._client.emit(mode);else bot.emit(mode==='close'?'windowClose':mode,bot.inventory);await assert.rejects(pending);clean(bot)}
})
test('snapshot ignores other window IDs and detects a replaced window',async()=>{
 const bot=fixture(),pending=syncWindow(bot,bot.inventory);bot.emit('setWindowItems:1');assert.equal(bot.listenerCount('setWindowItems:0'),1);bot.currentWindow={id:1};bot.emit('setWindowItems:0');await assert.rejects(pending,{code:'WINDOW_CHANGED'});clean(bot)
})
test('injected unresponsive snapshot backend is bounded',async()=>{
 const bot={inventory:{},_syncWindow:()=>new Promise(()=>{})};await assert.rejects(syncWindow(bot,bot.inventory,{timeoutMs:10}),{code:'INVENTORY_SYNC_TIMEOUT'})
})
test('upstream craft/book snapshot entry is installed once and restored on disconnect',async()=>{
 const {installInventorySync}=require('../src/commands/inventory_sync'),bot=fixture(),original=()=>{throw Error('unbounded native must not run')};bot._syncWindow=original
 installInventorySync(bot);const bounded=bot._syncWindow;installInventorySync(bot);assert.equal(bot._syncWindow,bounded)
 bot._client.write=()=>queueMicrotask(()=>bot.emit('setWindowItems:0'));await bot._syncWindow(bot.inventory)
 bot.emit('end');assert.equal(bot._syncWindow,original);clean(bot)
})
