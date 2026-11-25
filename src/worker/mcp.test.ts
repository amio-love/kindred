import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import app from './index'

function createMemD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url))
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(join(migrationsDir, file), 'utf-8'))
  }
  const makeStmt = (sql: string, bindings: SQLInputValue[] = []): D1PreparedStatement =>
    ({
      bind(...params: SQLInputValue[]) {
        return makeStmt(sql, params)
      },
      async first<T = Record<string, unknown>>() {
        return (sqlite.prepare(sql).get(...bindings) as T | undefined) ?? null
      },
      async all<T = Record<string, unknown>>() {
        return { results: sqlite.prepare(sql).all(...bindings) as T[], success: true, meta: {} } as unknown as D1Result<T>
      },
      async run() {
        const info = sqlite.prepare(sql).run(...bindings)
        return { results: [], success: true, meta: { changes: Number(info.changes) } } as unknown as D1Result
      },
      async raw() {
        return []
      },
      _sql: sql,
      _bindings: bindings,
    }) as unknown as D1PreparedStatement
  return {
    prepare: (sql: string) => makeStmt(sql),
    async batch(statements: D1PreparedStatement[]) {
      sqlite.exec('BEGIN TRANSACTION')
      try {
        const results: D1Result[] = []
        for (const stmt of statements) {
          const s = stmt as unknown as { _sql: string; _bindings: SQLInputValue[] }
          const info = sqlite.prepare(s._sql).run(...s._bindings)
          results.push({ results: [], success: true, meta: { changes: Number(info.changes) } } as unknown as D1Result)
        }
        sqlite.exec('COMMIT')
        return results
      } catch (err) {
        sqlite.exec('ROLLBACK')
        throw err
      }
    },
    async exec(sql: string) {
      sqlite.exec(sql)
      return { count: 1, duration: 0 }
    },
    async dump() {
      return new ArrayBuffer(0)
    },
  } as unknown as D1Database
}

function makeEnv() {
  return {
    DB: createMemD1(),
    ASSETS: {
      async fetch() {
        return new Response('<html>fallback</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      },
    } as unknown as Fetcher,
  }
}

describe('Streamable HTTP MCP, CORS, and route boundary compliance', () => {
  test('GET /mcp returns 405 with Allow header and OPTIONS /mcp allows Mcp-Protocol-Version for browser SDKs', async () => {
    const env = makeEnv()
    const getRes = await app.request('https://kindred.example.test/mcp', { method: 'GET' }, env)
    assert.equal(getRes.status, 405)
    assert.equal(getRes.headers.get('Allow'), 'POST, OPTIONS')

    const preflight = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://client.example.org',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type, mcp-protocol-version',
        },
      },
      env,
    )
    assert.equal(preflight.status, 204)
    assert.match(preflight.headers.get('Access-Control-Allow-Headers') ?? '', /Mcp-Protocol-Version/i)
  })

  test('POST /mcp returns -32700 on invalid JSON, handles notifications (202), JSON-RPC batches, tools/list, and tools/call dispatch', async () => {
    const env = makeEnv()

    const badJson = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not-valid-json',
      },
      env,
    )
    assert.equal(badJson.status, 400)
    const badJsonBody = (await badJson.json()) as { error?: { code?: number } }
    assert.equal(badJsonBody.error?.code, -32700)

    const notif = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }),
      },
      env,
    )
    assert.equal(notif.status, 202)

    const emptyBatch = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([]),
      },
      env,
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
          { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        ]),
      },
      env,
    )
    assert.equal(batchRes.status, 200)
    const items = (await batchRes.json()) as Array<{
      id: number
      result?: { protocolVersion?: string; tools?: Array<{ name: string }> }
    }>
    assert.equal(items.length, 2)
    assert.equal(items[0]?.result?.protocolVersion, '2025-03-26')
    assert.equal(items[1]?.result?.tools?.length, 11)

    const okCall = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'kindred_publish_quiz',
            arguments: {
              questions: [1, 2, 3].map((i) => ({
                dimension: 'Taste',
                prompt: `Evening habit question ${i}?`,
                options: { A: `opt-a-${i}`, B: `opt-b-${i}`, C: `opt-c-${i}`, D: `opt-d-${i}` },
                owner_choice: 'A',
              })),
            },
          },
        }),
      },
      env,
    )
    assert.equal(okCall.status, 200)
    const okPayload = (await okCall.json()) as {
      result?: { isError?: boolean; structuredContent?: { agent_id?: string; agent_token?: string } }
    }
    assert.equal(okPayload.result?.isError, false)
    const token = okPayload.result?.structuredContent?.agent_token
    const agentId = okPayload.result?.structuredContent?.agent_id
    assert.ok(token)

    const bearerInbox = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'kindred_inbox', arguments: {} },
        }),
      },
      env,
    )
    const bearerBody = (await bearerInbox.json()) as {
      result?: { isError?: boolean; structuredContent?: { agent_id?: string } }
    }
    assert.equal(bearerBody.result?.isError, false)
    assert.equal(bearerBody.result?.structuredContent?.agent_id, agentId)

    const queryInbox = await app.request(
      `https://kindred.example.test/mcp?token=${encodeURIComponent(token!)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: { name: 'kindred_inbox', arguments: {} },
        }),
      },
      env,
    )
    const queryBody = (await queryInbox.json()) as {
      result?: { isError?: boolean; structuredContent?: { agent_id?: string } }
    }
    assert.equal(queryBody.result?.isError, false)
    assert.equal(queryBody.result?.structuredContent?.agent_id, agentId)

    const argInbox = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: { name: 'kindred_inbox', arguments: { agent_token: token } },
        }),
      },
      env,
    )
    const argBody = (await argInbox.json()) as {
      result?: { isError?: boolean; structuredContent?: { agent_id?: string } }
    }
    assert.equal(argBody.result?.isError, false)
    assert.equal(argBody.result?.structuredContent?.agent_id, agentId)

    const argOverridesBadHeader = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer knd_invalid_header' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: { name: 'kindred_inbox', arguments: { agent_token: token } },
        }),
      },
      env,
    )
    const argWinBody = (await argOverridesBadHeader.json()) as {
      result?: { isError?: boolean; structuredContent?: { agent_id?: string } }
    }
    assert.equal(argWinBody.result?.isError, false)
    assert.equal(argWinBody.result?.structuredContent?.agent_id, agentId)

    const badArgOverridesValidHeader = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: { name: 'kindred_inbox', arguments: { agent_token: 'knd_invalid_arg' } },
        }),
      },
      env,
    )
    const badArgBody = (await badArgOverridesValidHeader.json()) as {
      result?: { isError?: boolean }
    }
    assert.equal(badArgBody.result?.isError, true)

    const trailingSlashPing = await app.request(
      'https://kindred.example.test/mcp/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }),
      },
      env,
    )
    assert.equal(trailingSlashPing.status, 200)

    const errCall = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'kindred_unknown_tool', arguments: {} },
        }),
      },
      env,
    )
    assert.equal(errCall.status, 200)
    const errPayload = (await errCall.json()) as { result?: { isError?: boolean } }
    assert.equal(errPayload.result?.isError, true)
  })

  test('GET /skill.md returns markdown while malformed /skill.md, /api/none, and /mcp/extra return 404 instead of SPA HTML', async () => {
    const env = makeEnv()
    const ok = await app.request('https://kindred.example.test/skill.md', { method: 'GET' }, env)
    assert.equal(ok.status, 200)
    assert.match(ok.headers.get('Content-Type') ?? '', /text\/markdown/)

    for (const badPath of ['/skill.md%EF%BC%8C%E7%84%B6%E5%90%8E', '/api', '/api/none', '/mcp/extra']) {
      const res = await app.request(`https://kindred.example.test${badPath}`, { method: 'GET' }, env)
      assert.equal(res.status, 404, `Expected 404 on ${badPath}, got ${res.status}`)
    }
  })
})
