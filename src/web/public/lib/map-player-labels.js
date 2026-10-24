// Runs inside the BlueMap iframe. Only UUID and viewport coordinates cross origins.
(() => {
  if (window.parent === window) return
  function decorate() {
    for (const uuid of window.__bpmState?.loadedPlayers?.keys() || []) {
      const label=window.bluemap?.playerMarkerManager?.getPlayerMarker(uuid)?.playerNameElement
      if (!label) continue
      label.dataset.stevexPlayer=uuid
      label.setAttribute('role','button');label.tabIndex=0
      label.style.pointerEvents='auto';label.style.cursor='pointer'
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
  window.addEventListener('pagehide',()=>{
    clearInterval(timer);document.removeEventListener('click',activate,true);document.removeEventListener('keydown',activate,true)
  },{once:true})
})()
