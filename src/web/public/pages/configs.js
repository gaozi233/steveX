// ── steveX Configs page ──
// Read, edit, save and reload configs/environments/app.json.

import { fetchEnvConfig, saveEnvConfig, reloadConfig } from '../lib/api.js'

let editorEl = null
let statusEl = null
let loadRevision = 0
let saveRevision = 0

function setStatus(message, type = 'info') {
  if (!statusEl) return

  statusEl.textContent = message
  statusEl.className = `config-status ${type}`
}

function formatConfig(config) {
  return JSON.stringify(config, null, 2)
}

async function loadConfig() {
  const revision = ++loadRevision
  const editor = editorEl
  const isCurrent = () => revision === loadRevision && editor === editorEl && editor?.isConnected
  try {
    setStatus('Loading...', 'info')

    const data = await fetchEnvConfig()
    if (!isCurrent()) return

    if (editorEl) {
      editorEl.value = formatConfig(data.config)
    }

    setStatus('Loaded successfully.', 'success')
  } catch (err) {
    if (!isCurrent()) return
    console.error('[configs] Load failed:', err)

    if (editorEl) {
      editorEl.value = ''
      editorEl.placeholder = `Failed to load: ${err.message}`
    }

    setStatus(`Load failed: ${err.message}`, 'error')
  }
}

async function saveConfig({ shouldReload = false } = {}) {
  if (!editorEl) return
  const revision=++saveRevision,editor=editorEl
  const isCurrent=()=>revision===saveRevision && editor===editorEl && editor.isConnected

  let parsedConfig

  try {
    parsedConfig = JSON.parse(editorEl.value)
  } catch (err) {
    setStatus(`Invalid JSON: ${err.message}`, 'error')
    return
  }

  try {
    setStatus('Saving...', 'info')

    await saveEnvConfig(parsedConfig)

    if (shouldReload) {
      if(isCurrent())setStatus('Reloading...', 'info')
      await reloadConfig()
      if(isCurrent())setStatus('Saved and reloaded successfully.', 'success')
      return
    }

    if(isCurrent())setStatus('Saved successfully.', 'success')
  } catch (err) {
    console.error('[configs] Save failed:', err)
    if(isCurrent())setStatus(`Save failed: ${err.message}`, 'error')
  }
}

function prettyPrintConfig() {
  if (!editorEl) return

  try {
    const parsed = JSON.parse(editorEl.value)
    editorEl.value = formatConfig(parsed)
    setStatus('Formatted successfully.', 'success')
  } catch (err) {
    setStatus(`Invalid JSON: ${err.message}`, 'error')
  }
}

function copyConfig() {
  if (!editorEl) return

  navigator.clipboard.writeText(editorEl.value)
    .then(() => {
      setStatus('Copied to clipboard.', 'success')
    })
    .catch(err => {
      console.error('[configs] Copy failed:', err)
      setStatus(`Copy failed: ${err.message}`, 'error')
    })
}

export function renderConfigs(container) {
  ++saveRevision
  container.innerHTML = `
    <section class="config-page">
      <div class="config-card">
        <div class="config-top">
          <div>
            <h2>Environment Config</h2>
            <p>Edit and reload the active environment settings.</p>
          </div>

          <div class="config-status-wrap">
            <span id="config-status" class="config-status info">Ready.</span>
          </div>
        </div>

        <div class="config-toolbar">
          <button id="config-load" class="config-btn config-btn-light" type="button">
            Load
          </button>

          <button id="config-format" class="config-btn config-btn-light" type="button">
            Format
          </button>

          <button id="config-copy" class="config-btn config-btn-light" type="button">
            Copy
          </button>

          <div class="config-toolbar-spacer"></div>

          <button id="config-save" class="config-btn config-btn-success" type="button">
            Save
          </button>

          <button id="config-save-reload" class="config-btn config-btn-primary" type="button">
            Save & Reload
          </button>
        </div>

        <textarea
          id="config-editor"
          class="config-editor"
          spellcheck="false"
          placeholder="Loading configuration..."
        ></textarea>
      </div>
    </section>
  `

  editorEl = container.querySelector('#config-editor')
  statusEl = container.querySelector('#config-status')

  container.querySelector('#config-load').addEventListener('click', loadConfig)
  container.querySelector('#config-format').addEventListener('click', prettyPrintConfig)
  container.querySelector('#config-copy').addEventListener('click', copyConfig)
  container.querySelector('#config-save').addEventListener('click', () => saveConfig({ shouldReload: false }))
  container.querySelector('#config-save-reload').addEventListener('click', () => saveConfig({ shouldReload: true }))

  loadConfig()
}
