const api = require('../workstations')
module.exports = {
  name: 'window', description: 'Read current window slots, properties, trades and workstation options', usage: 'window',
  handler: bot => api.guarded(async () => { const data = api.describe(bot); return { ok: true, output: JSON.stringify(data), window: data } })
}
