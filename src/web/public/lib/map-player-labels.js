// Runs inside the BlueMap iframe. Human control sends only UUID/map/grid actions.
(() => {
  if (window.parent === window) return
  let controlled=null,down=null,target=null,overlay=null,outline=null,line=null,renderEvents=null
  function clearOverlay() {
    overlay?.removeFromParent()
    for(const object of [outline,line]){object?.geometry.dispose();object?.material.dispose()}
    if(renderEvents)renderEvents.removeEventListener('bluemapRenderFrame',updateOverlay)
    renderEvents=null;overlay=null;outline=null;line=null
  }
  function updateOverlay() {
    if(!overlay)return
    const viewer=window.bluemap.mapViewer
    overlay.visible=!!target && viewer.map?.data.id===target.mapId
    const player=window.__bpmState?.loadedPlayers?.get(controlled),position=player?.currentPos
    line.visible=overlay.visible && !!target.active && !!position
    if(line.visible){
      const points=line.geometry.attributes.position
      points.setXYZ(0,position.x,position.y+1,position.z)
      points.setXYZ(1,target.position.x+.5,target.position.y+.5,target.position.z+.5)
      points.needsUpdate=true
    }
  }
  function showTarget(data) {
    const THREE=window.BlueMap?.Three,viewer=window.bluemap?.mapViewer
    if(!THREE?.BoxGeometry || !viewer?.markers)return
    if(!overlay){
      overlay=new THREE.Group();overlay.name='stevex-command-target'
      const box=new THREE.BoxGeometry(1.015,1.015,1.015),edges=new THREE.EdgesGeometry(box);box.dispose()
      outline=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:0x2785ff,depthTest:false,transparent:true,opacity:.95}))
      line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0x2785ff,depthTest:false,transparent:true,opacity:.8}))
      outline.raycast=()=>{};line.raycast=()=>{};line.frustumCulled=false
      outline.renderOrder=line.renderOrder=1000;overlay.add(outline,line);viewer.markers.add(overlay)
      renderEvents=window.bluemap.events;renderEvents.addEventListener('bluemapRenderFrame',updateOverlay)
    }
    target=data;outline.position.set(data.position.x+.5,data.position.y+.5,data.position.z+.5)
    updateOverlay();viewer.redraw()
  }
  function message(event) {
    if(event.source!==window.parent || (parentOrigin!=='*' && event.origin!==parentOrigin))return
    const origin=new URL(event.origin)
    if(origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))return
    parentOrigin=event.origin
    if(event.data?.type==='stevex-control-player'){
      controlled=event.data.uuid || null;target=null;clearOverlay();decorate();window.bluemap?.mapViewer?.redraw?.()
    }
    if(event.data?.type==='stevex-control-target' && event.data.uuid===controlled){
      const data=event.data
      if(data.position && ['x','y','z'].every(k=>Number.isSafeInteger(data.position[k])) && typeof data.mapId==='string'){
        if(data.active || target?.requestId===data.requestId)showTarget(data)
      }
    }
  }
  let parentOrigin=document.referrer?new URL(document.referrer).origin:window.location.ancestorOrigins?.[0]||'*'
  window.addEventListener('message',message)
  function blockAction(event) {
    if(!controlled || event.target.closest?.('[data-stevex-player],button,input,a,.menu'))return false
    const viewer=window.bluemap?.mapViewer,THREE=window.BlueMap?.Three,terrain=viewer?.map?.hiresTileManager?.scene
    if(!terrain || !THREE || !viewer.rootElement.contains(event.target))return false
    const rect=viewer.rootElement.getBoundingClientRect(),ray=new THREE.Raycaster()
    viewer.camera.updateMatrixWorld();terrain.updateMatrixWorld(true)
    ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),viewer.camera)
    const hit=ray.intersectObject(terrain,true).find(h=>{for(let o=h.object;o;o=o.parent)if(!o.visible)return false;return true})
    if(!hit)return false
    const point=hit.point.clone().addScaledVector(ray.ray.direction,0.001).floor()
    window.parent.postMessage({type:'stevex-map-block',uuid:controlled,action:event.button===2?'goto':'dig',
      mapId:viewer.map.data.id,position:{x:point.x,y:point.y,z:point.z}},parentOrigin)
    return true
  }
  function pointerDown(event) {down={x:event.clientX,y:event.clientY,button:event.button}}
  function pointerUp(event) {
    if(controlled && event.button===2 && down?.button===2 && !event.target.closest?.('[data-stevex-player]') && Math.hypot(event.clientX-down.x,event.clientY-down.y)<5)blockAction(event)
  }
  function context(event) {
    const label=event.target.closest?.('[data-stevex-player]')
    if(label){
      event.preventDefault();event.stopImmediatePropagation()
      window.parent.postMessage({type:'stevex-control-select',uuid:label.dataset.stevexPlayer},parentOrigin)
    } else if(controlled) {
      event.preventDefault();event.stopImmediatePropagation()
    }
  }
  function decorate() {
    for (const uuid of window.__bpmState?.loadedPlayers?.keys() || []) {
      const label=window.bluemap?.playerMarkerManager?.getPlayerMarker(uuid)?.playerNameElement
      if (!label) continue
      label.dataset.stevexPlayer=uuid
      label.setAttribute('role','button');label.tabIndex=0
      label.style.pointerEvents='auto';label.style.cursor='pointer'
      label.style.outline=uuid===controlled?'2px solid #2785ff':''
      label.style.outlineOffset=uuid===controlled?'3px':''
      label.setAttribute('aria-pressed',String(uuid===controlled))
      label.setAttribute('aria-label','Player status: '+label.textContent)
    }
  }
  function activate(event) {
    const label=event.target.closest?.('[data-stevex-player]')
    if (event.type==='keydown' && (!label || !['Enter',' '].includes(event.key))) {
      if (event.key==='Escape') window.parent.postMessage({type:'stevex-player-close'},'*')
      return
    }
    if (!label) {
      if(event.type==='click' && controlled && down?.button===0 && Math.hypot(event.clientX-down.x,event.clientY-down.y)<5 && blockAction(event)){
        event.preventDefault();event.stopImmediatePropagation();return
      }
      if(event.type==='click')window.parent.postMessage({type:'stevex-player-close'},'*')
      return
    }
    event.preventDefault();event.stopImmediatePropagation()
    const rect=label.getBoundingClientRect()
    window.parent.postMessage({type:'stevex-player-select',uuid:label.dataset.stevexPlayer,
      x:rect.left+rect.width/2,y:rect.bottom,width:innerWidth,height:innerHeight},'*')
  }
  decorate()
  const timer=setInterval(decorate,1000)
  document.addEventListener('click',activate,true)
  document.addEventListener('keydown',activate,true)
  document.addEventListener('pointerdown',pointerDown,true)
  document.addEventListener('pointerup',pointerUp,true)
  document.addEventListener('contextmenu',context,true)
  window.addEventListener('pagehide',()=>{
    clearInterval(timer);document.removeEventListener('click',activate,true);document.removeEventListener('keydown',activate,true)
    document.removeEventListener('pointerdown',pointerDown,true);document.removeEventListener('contextmenu',context,true)
    document.removeEventListener('pointerup',pointerUp,true)
    window.removeEventListener('message',message)
    clearOverlay()
  },{once:true})
})()
