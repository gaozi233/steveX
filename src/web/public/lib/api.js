// ── steveX HTTP API client ──

import { setState } from './state.js'

export async function fetchStatus() {
  const res = await fetch('/api/status?view=summary')
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

export async function connectAgent(name, { signal } = {}) {
  const res = await fetch(`/api/agents/${encodeURIComponent(name)}/connect`, {
    method: 'POST', signal
  })
  return res.ok
}

export async function disconnectAgent(name, { signal } = {}) {
  const res = await fetch(`/api/agents/${encodeURIComponent(name)}/disconnect`, {
    method: 'POST', signal
  })
  return res.ok
}

export async function sendCommand(name, command, { signal } = {}) {
  const res = await fetch(`/api/agents/${encodeURIComponent(name)}/command`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command })
  })
  const result = await res.json()
  return result
}
export async function sendPlannerMessage(name, message, mode, options = {}, { signal } = {}) {
  const res = await fetch(`/api/agents/${encodeURIComponent(name)}/planner/message`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, mode, ...options })
  })
  const result = await res.json()
  if (!res.ok) throw Object.assign(new Error(result.error || result.result?.error || 'Planner request failed'), { result })
  return result
}

export async function controlPlanner(name, operation, mode, taskId, { signal } = {}) {
  const res = await fetch(`/api/agents/${encodeURIComponent(name)}/planner/control`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, mode, taskId })
  })
  const result = await res.json()
  if (!res.ok) throw Object.assign(new Error(result.error || result.result?.error || 'Task control failed'), { result })
  return result
}

export async function stopPlanner(name, { signal } = {}) {
  const res = await fetch(`/api/agents/${encodeURIComponent(name)}/brain/stop`, { method: 'POST', signal })
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
