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
        return new Response('<!doctype html><html><body><div id="root"></div></body></html>', {
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
    assert.equal(batchRes.headers.get('Cache-Control'), 'no-store')
    const items = (await batchRes.json()) as Array<{
      id: number
      result?: {
        protocolVersion?: string
        serverInfo?: { name?: string; version?: string }
        capabilities?: { tools?: unknown; resources?: unknown; prompts?: unknown }
        instructions?: string
        tools?: Array<{ name: string }>
      }
    }>
    assert.equal(items.length, 2)
    assert.equal(items[0]?.result?.protocolVersion, '2025-03-26')
    assert.equal(items[0]?.result?.serverInfo?.version, '2.3.0')
    assert.ok(items[0]?.result?.capabilities?.prompts)
    assert.ok(items[0]?.result?.instructions?.includes('kindred_guide'))
    assert.equal(items[1]?.result?.tools?.length, 13)

    const guideCall = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 20,
          method: 'tools/call',
          params: { name: 'kindred_guide', arguments: { locale: 'zh' } },
        }),
      },
      env,
    )
    assert.equal(guideCall.status, 200)
    assert.equal(guideCall.headers.get('Cache-Control'), 'no-store')
    const guidePayload = (await guideCall.json()) as {
      result?: {
        isError?: boolean
        structuredContent?: {
          current_skill_version?: number
          mcp_url?: string
          guide_markdown?: string
          seeds?: Array<{ lens: string; angle: string }>
        }
      }
    }
    assert.equal(guidePayload.result?.isError, false)
    assert.equal(guidePayload.result?.structuredContent?.current_skill_version, 2)
    assert.equal(guidePayload.result?.structuredContent?.mcp_url, 'https://kindred.example.test/mcp')
    assert.ok(guidePayload.result?.structuredContent?.guide_markdown?.includes('Step 0: Preferred Transport'))
    assert.equal(guidePayload.result?.structuredContent?.seeds?.length, 8)

    const promptsList = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 22, method: 'prompts/list' }),
      },
      env,
    )
    assert.equal(promptsList.status, 200)
    const promptsListBody = (await promptsList.json()) as {
      result?: { prompts?: Array<{ name: string }> }
    }
    assert.deepEqual(
      promptsListBody.result?.prompts?.map((p) => p.name),
      ['start_kindred', 'upgrade_kindred'],
    )

    const startPrompt = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 23,
          method: 'prompts/get',
          params: { name: 'start_kindred', arguments: { locale: 'zh' } },
        }),
      },
      env,
    )
    assert.equal(startPrompt.status, 200)
    const startPromptBody = (await startPrompt.json()) as {
      result?: { messages?: Array<{ content?: { text?: string } }> }
    }
    assert.ok(startPromptBody.result?.messages?.[0]?.content?.text?.includes('Session Scenario Sparks'))

    const upgradePrompt = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 24,
          method: 'prompts/get',
          params: { name: 'upgrade_kindred', arguments: { locale: 'en' } },
        }),
      },
      env,
    )
    assert.equal(upgradePrompt.status, 200)
    const upgradePromptBody = (await upgradePrompt.json()) as {
      result?: { messages?: Array<{ content?: { text?: string } }> }
    }
    assert.ok(upgradePromptBody.result?.messages?.[0]?.content?.text?.includes('Upgrade Existing Kindred Quiz'))

    const badPrompt = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 25,
          method: 'prompts/get',
          params: { name: 'nonexistent_prompt' },
        }),
      },
      env,
    )
    assert.equal(badPrompt.status, 400)
    const badPromptBody = (await badPrompt.json()) as { error?: { code?: number } }
    assert.equal(badPromptBody.error?.code, -32602)

    const seedsCall = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 21,
          method: 'tools/call',
          params: { name: 'kindred_quiz_seeds', arguments: { locale: 'zh', count: 4 } },
        }),
      },
      env,
    )
    assert.equal(seedsCall.status, 200)
    const seedsPayload = (await seedsCall.json()) as {
      result?: { isError?: boolean; structuredContent?: { count?: number; seeds?: Array<{ lens: string; angle: string }> } }
    }
    assert.equal(seedsPayload.result?.isError, false)
    assert.equal(seedsPayload.result?.structuredContent?.count, 4)
    assert.equal(new Set(seedsPayload.result?.structuredContent?.seeds?.map((s) => s.lens)).size, 4)

    const httpSeeds = await app.request('https://kindred.example.test/api/quiz/seeds?locale=en&count=6', { method: 'GET' }, env)
    assert.equal(httpSeeds.status, 200)
    assert.equal(httpSeeds.headers.get('Cache-Control'), 'no-store')
    const httpSeedsBody = (await httpSeeds.json()) as { count: number; seeds: Array<{ lens: string; angle: string }> }
    assert.equal(httpSeedsBody.count, 6)
    assert.equal(new Set(httpSeedsBody.seeds.map((s) => s.lens)).size, 6)

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

  test('GET /skill.md and /llms.txt return markdown while malformed /skill.md, /api/none, and /mcp/extra return 404 instead of SPA HTML', async () => {
    const env = makeEnv()
    for (const path of ['/skill.md', '/llms.txt']) {
      const ok = await app.request(`https://kindred.example.test${path}`, { method: 'GET' }, env)
      assert.equal(ok.status, 200)
      assert.match(ok.headers.get('Content-Type') ?? '', /text\/markdown/)
      assert.equal(ok.headers.get('Cache-Control'), 'no-store')
      assert.match(ok.headers.get('Link') ?? '', /rel="alternate"/)
      assert.match(ok.headers.get('Link') ?? '', /\/\.well-known\/mcp\.json/)
      const text = await ok.text()
      assert.ok(text.includes('https://kindred.example.test/mcp'))
      assert.ok(text.includes('Step 0: Preferred Transport'))
      assert.ok(text.includes('kindred_guide'))
      assert.ok(text.includes('Session Scenario Sparks'))
      assert.ok(text.includes('Upgrading an existing quiz'))
      assert.ok(!text.includes('even with no extra message'))
      assert.ok(!text.includes('initiate adding this MCP server yourself'))
    }

    const wellKnown = await app.request('https://kindred.example.test/.well-known/mcp.json', { method: 'GET' }, env)
    assert.equal(wellKnown.status, 200)
    assert.match(wellKnown.headers.get('Content-Type') ?? '', /application\/json/)
    assert.equal(wellKnown.headers.get('Cache-Control'), 'no-store')
    const manifest = (await wellKnown.json()) as {
      endpoint?: string
      protocol_version?: string
      capabilities?: { tools?: boolean; resources?: boolean; prompts?: boolean }
    }
    assert.equal(manifest.endpoint, 'https://kindred.example.test/mcp')
    assert.equal(manifest.protocol_version, '2025-03-26')
    assert.deepEqual(manifest.capabilities, { tools: true, resources: true, prompts: true })

    const wellKnownHead = await app.request('https://kindred.example.test/.well-known/mcp.json', { method: 'HEAD' }, env)
    assert.equal(wellKnownHead.status, 200)
    assert.equal(await wellKnownHead.text(), '')

    const wranglerConfig = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url)), 'utf-8'),
    ) as { assets?: { run_worker_first?: string[] } }
    assert.ok(wranglerConfig.assets?.run_worker_first?.includes('/.well-known/*'))

    for (const badPath of ['/skill.md%EF%BC%8C%E7%84%B6%E5%90%8E', '/.well-known/other', '/api', '/api/none', '/mcp/extra']) {
      const res = await app.request(`https://kindred.example.test${badPath}`, { method: 'GET' }, env)
      assert.equal(res.status, 404, `Expected 404 on ${badPath}, got ${res.status}`)
    }
  })

  test('bare homepage URL / delivers full Kindred protocol directly to AI fetchers and semantic non-JS HTML fallback to browser-UA readers', async () => {
    const env = makeEnv()

    const agentHeaderCases: Array<Record<string, string>> = [
      { Accept: 'text/markdown' },
      { Accept: 'text/markdown, text/html;q=0.9' },
      { Accept: 'text/plain' },
      { Accept: '*/*', 'User-Agent': 'curl/8.7.1' },
      { Accept: 'text/html,application/xhtml+xml,*/*', 'User-Agent': 'Claude-User/1.0' },
      { Accept: 'text/html,*/*', 'User-Agent': 'ChatGPT-User/1.0' },
      { Accept: 'text/html,*/*', 'User-Agent': 'Perplexity-User/1.0' },
    ]
    for (const headers of agentHeaderCases) {
      const res = await app.request('https://kindred.example.test/', { method: 'GET', headers }, env)
      assert.equal(res.status, 200)
      assert.match(res.headers.get('Content-Type') ?? '', /text\/markdown/)
      assert.match(res.headers.get('Vary') ?? '', /Accept/)
      assert.match(res.headers.get('Link') ?? '', /\/skill\.md/)
      const body = await res.text()
      assert.ok(body.includes('kindred_publish_quiz'))
      assert.ok(body.includes('https://kindred.example.test/mcp'))
    }

    const browserHtmlRes = await app.request(
      'https://kindred.example.test/',
      {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
        },
      },
      env,
    )
    assert.equal(browserHtmlRes.status, 200)
    assert.match(browserHtmlRes.headers.get('Content-Type') ?? '', /text\/html/)
    assert.match(browserHtmlRes.headers.get('Link') ?? '', /\/skill\.md/)
    const html = await browserHtmlRes.text()
    assert.ok(html.includes('class="agent-ssr-skill"'))
    assert.ok(html.includes('kindred_publish_quiz'))
    assert.ok(html.includes('https://kindred.example.test/mcp'))

    const headRes = await app.request(
      'https://kindred.example.test/',
      { method: 'HEAD', headers: { Accept: 'text/markdown' } },
      env,
    )
    assert.equal(headRes.status, 200)
    assert.match(headRes.headers.get('Content-Type') ?? '', /text\/markdown/)
    assert.equal(await headRes.text(), '')
  })
})
