const LIMIT = 50
const MAX_LENGTH = 4000
const fallback = new Map()

function historyKey(form) {
  return 'stevex:input-history:' + JSON.stringify([form.dataset.agent, form.dataset.action])
}

function readHistory(key) {
  let entries = fallback.get(key) || []
  try {
    const saved = JSON.parse(globalThis.localStorage.getItem(key))
    if (Array.isArray(saved)) entries = saved.filter(s => typeof s === 'string' && s.trim() && s.length <= MAX_LENGTH).slice(-LIMIT)
  } catch { /* Storage may be unavailable in private or restricted browser contexts. */ }
  return entries
}

export function initInputHistory(container) {
  const cursors = new WeakMap()
  function formFor(input) {
    if (!input?.matches?.('input[name="message"]') || input.disabled || input.readOnly) return null
    const form = input.closest('form.command-panel')
    return form && ['command', 'message'].includes(form.dataset.action) ? form : null
  }
  function keydown(event) {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key) || event.isComposing || event.keyCode === 229
      || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
    const input = event.target, form = formFor(input)
    if (!form) return
    const entries = readHistory(historyKey(form))
    if (!entries.length) return
    let cursor = cursors.get(input)
    if (!cursor) {
      if (event.key === 'ArrowDown') return
      cursor = { index: entries.length, draft: input.value }
      cursors.set(input, cursor)
    }
    event.preventDefault()
    cursor.index = Math.max(0, Math.min(entries.length, cursor.index + (event.key === 'ArrowUp' ? -1 : 1)))
    input.value = cursor.index === entries.length ? cursor.draft : entries[cursor.index]
    input.setCustomValidity('')
    input.setSelectionRange(input.value.length, input.value.length)
  }
  function edit(event) {
    if (formFor(event.target)) {
      cursors.delete(event.target)
      event.target.setCustomValidity('')
    }
  }
  function submit(event) {
    const form = event.target.closest?.('form.command-panel')
    const input = form?.querySelector('input[name="message"]')
    if (!formFor(input) || form.querySelector('button[type="submit"]')?.disabled) return
    const value = input.value.trim()
    if (!value || value.length > MAX_LENGTH) return
    const key = historyKey(form), entries = readHistory(key)
    if (entries.at(-1) !== value) entries.push(value)
    const saved = entries.slice(-LIMIT)
    fallback.set(key, saved)
    try { globalThis.localStorage.setItem(key, JSON.stringify(saved)) } catch {}
    cursors.delete(input)
  }
  container.addEventListener('keydown', keydown)
  container.addEventListener('input', edit)
  // Register before the async sender so accepted submissions are saved before fields clear.
  container.addEventListener('submit', submit)
  return () => {
    container.removeEventListener('keydown', keydown)
    container.removeEventListener('input', edit)
    container.removeEventListener('submit', submit)
  }
}
