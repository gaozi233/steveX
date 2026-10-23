// ── steveX HTTP API client ──

import { setState } from './state.js'

export async function fetchStatus() {
  const res = await fetch('/api/status')
  const data = await res.json()
  setState({ agents: data.agents, uptimeSec: data.uptimeSec })
  return data
}

export async function reloadConfig() {
  await fetch('/api/reload', { method: 'POST' })
  // Wait a moment for agents to establish connections before checking status
  await new Promise(resolve => setTimeout(resolve, 1500))
  await fetchStatus()
}

export async function connectAgent(name) {
  const res = await fetch(`/api/agents/${encodeURIComponent(name)}/connect`, {
    method: 'POST'
  })
  return res.ok
}

export async function disconnectAgent(name) {
  const res = await fetch(`/api/agents/${encodeURIComponent(name)}/disconnect`, {
    method: 'POST'
  })
  return res.ok
}

export async function sendCommand(name, command) {
  const res = await fetch(`/api/agents/${encodeURIComponent(name)}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command })
  })
  const result = await res.json()
  return result
}
export async function sendPlannerMessage(name, message, mode) {
  const res = await fetch(`/api/agents/${encodeURIComponent(name)}/planner/message`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, mode })
  })
  const result = await res.json()
  if (!res.ok) throw Object.assign(new Error(result.error || result.result?.error || 'Planner request failed'), { result })
  return result
}

export async function stopPlanner(name) {
  const res = await fetch(`/api/agents/${encodeURIComponent(name)}/brain/stop`, { method: 'POST' })
  if (!res.ok) throw new Error('Could not stop planner')
}

export async function fetchEnvConfig() {
  const res = await fetch('/api/config/environment')

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to load config')
  }

  return res.json()
}

export async function saveEnvConfig(config) {
  const res = await fetch('/api/config/environment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ config })
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to save config')
  }

  return res.json()
}
