import { escapeHtml } from '../lib/utils.js'
import { hydrateIcons } from '../lib/icons.js'

export function mountWorld(container) {
  const controller = new AbortController()
  let disposed = false, frame, reload, address, mapOrigin, popup, playerRequest, playerTimer, selectedUuid
  const documentEvents = typeof document !== 'undefined' ? document : null
  const windowEvents = typeof window !== 'undefined' ? window : null
  const timer = setTimeout(() => controller.abort(), 5000)
  container.innerHTML = '<p role="status">Loading map...</p>'
  fetch('/api/world-map', { signal: controller.signal, cache: 'no-store' }).then(async response => {
    const data = await response.json()
    if (disposed) return
    if (!response.ok || !data.ok) throw new Error(data.error || 'Map unavailable')
    if (!data.enabled) { container.innerHTML = '<p role="status">World map disabled</p>'; return }
    const url = new URL(data.url)
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || url.origin === location.origin || (location.port && url.port === location.port) || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Invalid map address')
    }
    container.innerHTML = `<section class="world-view"><div class="world-toolbar"><span>Human view <span class="world-source">World files · Asynchronous updates</span></span><div><a class="btn ghost" href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">Open map</a><button class="btn ghost" type="button" data-map-reload title="Reload map" aria-label="Reload map"><span data-icon="refresh"></span></button></div></div><iframe class="world-frame" title="BlueMap world map" sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="fullscreen" referrerpolicy="no-referrer"></iframe></section>`
    frame = container.querySelector('iframe')
    address = url.href; mapOrigin = url.origin
    frame.src = documentEvents?.hidden ? 'about:blank' : address
    documentEvents?.addEventListener('visibilitychange', visibility)
    windowEvents?.addEventListener('message', camera)
    windowEvents?.addEventListener('resize', constrainPopup)
    documentEvents?.addEventListener('keydown', escape)
    documentEvents?.addEventListener('pointerdown', outside)
    reload = container.querySelector('[data-map-reload]')
    reload.addEventListener('click', reloadMap)
    hydrateIcons(container)
  }).catch(error => {
    if (!disposed) container.innerHTML = `<p role="status">${escapeHtml(error.name === 'AbortError' ? 'Map request timed out' : error.message)}</p>`
  }).finally(() => clearTimeout(timer))
  function reloadMap() { if (!disposed && frame) frame.src = frame.src }
  function camera(event) {
    if (disposed || event.origin !== mapOrigin || event.source !== frame?.contentWindow) return
    if (event.data?.type === 'stevex-map-camera' && typeof event.data.hash === 'string'
      && event.data.hash.startsWith('#') && event.data.hash.length < 1024) address = mapOrigin + '/' + event.data.hash
    if (event.data?.type === 'stevex-player-close') closePlayer()
    if (event.data?.type === 'stevex-player-select') {
      const data=event.data
      if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(data.uuid || '')
        || ![data.x,data.y,data.width,data.height].every(Number.isFinite) || data.width<=0 || data.height<=0) return
      closePlayer();selectedUuid=data.uuid
      popup=documentEvents.createElement('section');popup.className='world-player-popup'
      popup.setAttribute('role','region');popup.setAttribute('aria-label','Player status')
      popup.innerHTML='<p role="status">Loading player...</p>'
      documentEvents.body.appendChild(popup)
      const rect=frame.getBoundingClientRect()
      const left=rect.left+Math.max(0,Math.min(data.width,data.x))/data.width*rect.width
      const top=rect.top+Math.max(0,Math.min(data.height,data.y))/data.height*rect.height
      popup.style.left=Math.max(8,Math.min(left,windowEvents.innerWidth-304))+'px'
      popup.style.top=Math.max(8,Math.min(top+8,windowEvents.innerHeight-260))+'px'
      refreshPlayer()
    }
  }
  async function refreshPlayer() {
    const uuid=selectedUuid, target=popup
    playerRequest=new AbortController()
    try {
      const response=await fetch('/api/world-map/players/'+encodeURIComponent(uuid),{
        signal:AbortSignal.any([playerRequest.signal,AbortSignal.timeout(5000)]),cache:'no-store'})
      const data=await response.json()
      if(disposed || popup!==target)return
      if(!response.ok || !data.ok)throw Error(data.error || 'Player status unavailable')
      const p=data.player,pos=p.position
      const value=v=>escapeHtml(String(v ?? '—'))
      if (!target.querySelector('dl')) {
        target.innerHTML='<header><strong></strong><a class="world-player-info" data-agent-link title="Open agent debug" aria-label="Open agent debug">ⓘ</a><button type="button" class="world-player-close" aria-label="Close player status">×</button></header><dl></dl><p data-player-presence hidden>Offline</p>'
        target.querySelector('button').addEventListener('click',closePlayer)
      }
      target.querySelector('strong').textContent=p.username
      target.querySelector('a').href='/agents/'+encodeURIComponent(p.name)
      target.querySelector('[data-player-presence]').hidden=p.online
      target.querySelector('dl').innerHTML=`<dt>Health</dt><dd>${p.health==null?'—':value(p.health)+(p.maxHealth==null?'':' / '+value(p.maxHealth))}</dd>
        <dt>Game Mode</dt><dd>${value(p.gameMode)}</dd>
        <dt>Position</dt><dd>${pos?'x: '+value(pos.x)+', y: '+value(pos.y)+', z: '+value(pos.z):'—'}</dd>
        <dt>Current Action</dt><dd>${value(p.currentAction)}</dd>`
      constrainPopup()
    } catch(error) {
      if(!disposed && popup===target && error.name!=='AbortError')target.innerHTML=`<p role="status">${escapeHtml(error.message)}</p><button type="button" class="world-player-close" aria-label="Close player status">×</button>`
      target?.querySelector('button')?.addEventListener('click',closePlayer,{once:true})
    } finally {
      if(!disposed && popup===target)playerTimer=setTimeout(refreshPlayer,1000)
    }
  }
  function closePlayer() {
    clearTimeout(playerTimer);playerRequest?.abort();popup?.remove();popup=null;selectedUuid=null
  }
  function constrainPopup() {
    if(!popup)return
    const rect=popup.getBoundingClientRect()
    popup.style.left=Math.max(8,Math.min(rect.left,windowEvents.innerWidth-rect.width-8))+'px'
    popup.style.top=Math.max(8,Math.min(rect.top,windowEvents.innerHeight-rect.height-8))+'px'
  }
  function escape(event) {if(event.key==='Escape')closePlayer()}
  function outside(event) {if(popup && !popup.contains(event.target))closePlayer()}
  function visibility() {
    closePlayer()
    if (!disposed && frame) frame.src = documentEvents.hidden ? 'about:blank' : address
  }
  return () => {
    disposed = true
    closePlayer()
    clearTimeout(timer); controller.abort()
    reload?.removeEventListener('click', reloadMap)
    documentEvents?.removeEventListener('visibilitychange', visibility)
    windowEvents?.removeEventListener('message', camera)
    windowEvents?.removeEventListener('resize', constrainPopup)
    documentEvents?.removeEventListener('keydown', escape)
    documentEvents?.removeEventListener('pointerdown', outside)
    if (frame) { frame.src = 'about:blank'; frame.remove() }
  }
}
