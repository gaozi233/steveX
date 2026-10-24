const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
function setup(storage=new Map()) {
  const listeners={},container={addEventListener:(n,f)=>listeners[n]=f,removeEventListener:n=>delete listeners[n]}
  const context=vm.createContext({localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}})
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/web/public/lib/input-history.js'),'utf8').replace(/^export /gm,''),context)
  const release=context.initInputHistory(container)
  function field(agent='A',action='command') {
    const button={disabled:false},form={dataset:{agent,action},closest:()=>form,querySelector:s=>s.startsWith('button')?button:input}
    const input={value:'',matches:()=>true,closest:()=>form,setCustomValidity(){},setSelectionRange(a,b){this.selection=[a,b]}}
    return {input,form,button,save(value){input.value=value;listeners.submit({target:form})},key(key,extra={}){let prevented=false;listeners.keydown({target:input,key,preventDefault(){prevented=true},...extra});return prevented}}
  }
  return {field,listeners,release,storage,context}
}
test('arrows browse submitted history newest first, preserve draft and clamp boundaries',()=>{
  const h=setup(),f=h.field();f.save('hp');f.save('inventory');f.input.value='look angle '
  assert.equal(f.key('ArrowDown'),false)
  assert.equal(f.key('ArrowUp'),true);assert.equal(f.input.value,'inventory')
  f.key('ArrowUp');f.key('ArrowUp');assert.equal(f.input.value,'hp')
  f.key('ArrowDown');assert.equal(f.input.value,'inventory')
  f.key('ArrowDown');assert.equal(f.input.value,'look angle ')
  assert.deepEqual(f.input.selection,[11,11])
  h.release();assert.deepEqual(h.listeners,{})
})
test('history persists separately per agent and input kind, ignores blanks, caps and deduplicates',()=>{
  const h=setup(),a=h.field(),task=h.field('A','message'),b=h.field('B')
  a.save('hp');a.save('hp');a.save('  ');task.save('Build a bed');b.save('xp')
  assert.equal(JSON.parse([...h.storage.values()][0]).length,1)
  const restored=setup(h.storage)
  for(const [agent,kind,expected] of [['A','command','hp'],['A','message','Build a bed'],['B','command','xp']]){
    const f=restored.field(agent,kind);f.key('ArrowUp');assert.equal(f.input.value,expected)
  }
  for(let i=0;i<60;i++)a.save('say '+i)
  const saved=JSON.parse([...h.storage.values()][0]);assert.equal(saved.length,50);assert.equal(saved[0],'say 10')
  a.button.disabled=true;a.save('not submitted');assert.equal(JSON.parse([...h.storage.values()][0]).at(-1),'say 59')
})
test('editing resets browsing; composition and modified arrows are untouched; unavailable storage is safe',()=>{
  const h=setup(),f=h.field();f.save('hp');f.input.value='draft'
  for(const extra of [{isComposing:true},{keyCode:229},{ctrlKey:true},{shiftKey:true},{altKey:true},{metaKey:true}])assert.equal(f.key('ArrowUp',extra),false)
  f.key('ArrowUp');f.input.value='edited';h.listeners.input({target:f.input})
  f.key('ArrowUp');f.key('ArrowDown');assert.equal(f.input.value,'edited')
  vm.runInContext('globalThis.localStorage={getItem(){throw Error()},setItem(){throw Error()}}',h.context)
  f.save('inventory');f.key('ArrowUp');assert.equal(f.input.value,'inventory')
})
