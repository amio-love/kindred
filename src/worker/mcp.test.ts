import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import app from './index'

const MOCK_ENV = {
  DB: {} as D1Database,
  ASSETS: {
    async fetch() {
      return new Response('<html>fallback</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    },
  } as unknown as Fetcher,
}

describe('Streamable HTTP MCP and skill route compliance', () => {
  test('GET /mcp returns 405 Method Not Allowed with Allow header to prevent SSE reconnect loops', async () => {
    const res = await app.request('https://kindred.example.test/mcp', { method: 'GET' }, MOCK_ENV)
    assert.equal(res.status, 405)
    assert.equal(res.headers.get('Allow'), 'POST, OPTIONS')
  })

  test('POST /mcp accepts notifications (202), JSON-RPC batches, and rejects empty batches (400)', async () => {
    const notif = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }),
      },
      MOCK_ENV,
    )
    assert.equal(notif.status, 202)

    const emptyBatch = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([]),
      },
      MOCK_ENV,
    )
    assert.equal(emptyBatch.status, 400)

    const batchRes = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          { jsonrpc: '2.0', id: 2, method: 'ping' },
        ]),
      },
      MOCK_ENV,
    )
    assert.equal(batchRes.status, 200)
    const items = (await batchRes.json()) as Array<{ id: number; result?: Record<string, unknown> }>
    assert.equal(items.length, 2)
    assert.equal(items[0]?.id, 1)
    assert.equal(items[0]?.result?.protocolVersion, '2025-03-26')
    assert.equal(items[1]?.id, 2)
  })

  test('GET /skill.md returns markdown while malformed /skill.md with trailing punctuation returns 404', async () => {
    const ok = await app.request('https://kindred.example.test/skill.md', { method: 'GET' }, MOCK_ENV)
    assert.equal(ok.status, 200)
    assert.match(ok.headers.get('Content-Type') ?? '', /text\/markdown/)

    const bad = await app.request(
      'https://kindred.example.test/skill.md%EF%BC%8C%E7%84%B6%E5%90%8E',
      { method: 'GET' },
      MOCK_ENV,
    )
    assert.equal(bad.status, 404)
  })
})
