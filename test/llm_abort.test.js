const test = require('node:test')
const assert = require('node:assert/strict')
const { DeepSeekClient } = require('../src/llm/deepseek_client')

test('caller abort reaches fetch without waiting for the provider timeout', async t => {
  let requestSignal
  t.mock.method(globalThis, 'fetch', (url, { signal }) => new Promise((resolve, reject) => {
    requestSignal = signal
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const controller = new AbortController()
  const client = new DeepSeekClient({ apiKey: 'test-only', timeoutMs: 60000 })
  const request = client.chat([], { signal: controller.signal })
  controller.abort(new Error('cancel test'))
  await assert.rejects(request, /cancel test/)
  assert.equal(requestSignal.aborted, true)
})
