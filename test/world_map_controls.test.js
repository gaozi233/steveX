const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
test('iframe preserves left label popup, selects on right label and ignores dragged block controls',()=>{
 const handlers=new Map(),events=new Map(),posts=[],shape={point:{clone:()=>({x:2,y:70,z:-4,addScaledVector(){return this},floor(){return this}})},object:{visible:true}}
 const root={contains:()=>true,getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})}
 const parent={postMessage:data=>posts.push(data)},window={parent,location:{ancestorOrigins:[]},addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n),
   bluemap:{mapViewer:{rootElement:root,camera:{updateMatrixWorld(){}},map:{data:{id:'manual'},hiresTileManager:{scene:{updateMatrixWorld(){}}}}}},
   BlueMap:{Three:{Vector2:class{},Raycaster:class{constructor(){this.ray={direction:{}}}setFromCamera(){}intersectObject(){return [shape]}}}}}
 const document={referrer:'',addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:n=>handlers.delete(n)}
 const context=vm.createContext({window,document,URL,setInterval:()=>1,clearInterval,innerWidth:100,innerHeight:100})
 vm.runInContext(fs.readFileSync(require.resolve('../src/web/public/lib/map-player-labels.js'),'utf8'),context)
 const label={dataset:{stevexPlayer:'uuid'},getBoundingClientRect:()=>({left:0,bottom:1,width:2})}
 const event=(type,labelTarget=false,button=0,x=10)=>({type,button,clientX:x,clientY:10,target:{closest:()=>labelTarget?label:null},preventDefault(){},stopImmediatePropagation(){}})
 handlers.get('click')(event('click',true));assert.equal(posts.pop().type,'stevex-player-select')
 handlers.get('contextmenu')(event('contextmenu',true,2));assert.equal(posts.pop().type,'stevex-control-select')
 events.get('message')({source:{},origin:'http://127.0.0.1:8090',data:{type:'stevex-control-player',uuid:'uuid'}})
 handlers.get('pointerdown')(event('pointerdown'));handlers.get('click')(event('click'));assert.ok(!posts.some(p=>p.type==='stevex-map-block'))
 events.get('message')({source:parent,origin:'http://127.0.0.1:8090',data:{type:'stevex-control-player',uuid:'uuid'}})
 handlers.get('pointerdown')(event('pointerdown',false,2));handlers.get('contextmenu')(event('contextmenu',false,2))
 assert.ok(!posts.some(p=>p.type==='stevex-map-block'),'right-down must not execute')
 handlers.get('pointerup')(event('pointerup',false,2,40));assert.ok(!posts.some(p=>p.type==='stevex-map-block'),'drag must not execute')
 handlers.get('pointerdown')(event('pointerdown',false,2));handlers.get('pointerup')(event('pointerup',false,2))
 assert.equal(posts.pop().action,'goto')
 handlers.get('pointerdown')(event('pointerdown'));handlers.get('click')(event('click'));const dig=posts.pop()
 assert.equal(dig.action,'dig');assert.equal(dig.position.z,-4);assert.equal(dig.mapId,'manual')
 events.get('pagehide')();assert.equal(handlers.size,0);assert.equal(events.has('message'),false)
})

test('selection visuals follow player positions, keep target after completion and dispose on deselect',()=>{
 const listeners=new Map(),render=new Map(),posts=[],labels={style:{},dataset:{},setAttribute(k,v){this[k]=v}},objects=[]
 let disposed=0
 class Vector{set(x,y,z){Object.assign(this,{x,y,z})}}
 class Geometry{constructor(){this.attributes={position:{setXYZ(i,x,y,z){this[i]=[x,y,z]}}}}setFromPoints(){return this}dispose(){disposed++}}
 class Material{dispose(){disposed++}}
 class Object3D{constructor(geometry,material){Object.assign(this,{geometry,material,children:[],position:new Vector()})}add(...o){this.children.push(...o)}removeFromParent(){objects.splice(objects.indexOf(this),1)}}
 const parent={postMessage:p=>posts.push(p)},player={currentPos:{x:1,y:70,z:2}}
 const window={parent,location:{ancestorOrigins:[]},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),
   __bpmState:{loadedPlayers:new Map([['uuid',player]])},BlueMap:{Three:{Group:Object3D,BoxGeometry:Geometry,EdgesGeometry:Geometry,LineSegments:Object3D,Line:Object3D,LineBasicMaterial:Material,BufferGeometry:Geometry,Vector3:Vector}},
   bluemap:{events:{addEventListener:(n,f)=>render.set(n,f),removeEventListener:n=>render.delete(n)},playerMarkerManager:{getPlayerMarker:()=>({playerNameElement:labels})},mapViewer:{map:{data:{id:'manual'}},markers:{add:o=>objects.push(o)},redraw(){}}}}
 const document={referrer:'',addEventListener(){},removeEventListener(){}}
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/web/public/lib/map-player-labels.js'),'utf8'),{window,document,URL,setInterval:()=>1,clearInterval})
 const send=data=>listeners.get('message')({source:parent,origin:'http://127.0.0.1:8090',data})
 send({type:'stevex-control-player',uuid:'uuid'});assert.equal(labels['aria-pressed'],'true');assert.match(labels.style.outline,/blue|2785ff/)
 const target={type:'stevex-control-target',uuid:'uuid',requestId:2,mapId:'manual',position:{x:5,y:70,z:2},active:true}
 send(target);const [outline,line]=objects[0].children;assert.equal(line.visible,true)
 player.currentPos.x=3;render.get('bluemapRenderFrame')();assert.deepEqual(line.geometry.attributes.position[0],[3,71,2])
 send({...target,requestId:1,active:false});assert.equal(line.visible,true)
 send({...target,active:false});assert.equal(line.visible,false);assert.equal(objects.length,1)
 assert.equal(outline.position.x,5.5)
 send({type:'stevex-control-player',uuid:null});assert.equal(objects.length,0);assert.equal(render.size,0);assert.equal(labels.style.outline,'');assert.equal(disposed,5)
 listeners.get('pagehide')()
})
