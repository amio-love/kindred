import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { sha256Base64Url } from './env'
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

function sampleQuestions(prefix: string) {
  return [1, 2, 3].map((i) => ({
    dimension: 'Taste',
    prompt: `${prefix} evening habit question ${i}?`,
    options: { A: `${prefix}-a-${i}`, B: `${prefix}-b-${i}`, C: `${prefix}-c-${i}`, D: `${prefix}-d-${i}` },
    owner_choice: 'A',
  }))
}

async function runAnonymousOAuthFlow(
  env: ReturnType<typeof makeEnv>,
  options?: {
    redirectUri?: string
    authMethod?: 'none' | 'client_secret_basic' | 'client_secret_post'
    grantTypes?: string[]
    resource?: string
    omitRedirectUriOnAuthorize?: boolean
    omitRedirectUriOnToken?: boolean
  },
) {
  const redirectUri = options?.redirectUri ?? 'https://agent.meta.ai/api/hatch/oauth/callback'
  const authMethod = options?.authMethod ?? 'none'
  const grantTypes = options?.grantTypes ?? ['authorization_code', 'refresh_token']
  const regRes = await app.request(
    'https://kindred.example.test/oauth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Meta Muse',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: authMethod,
        grant_types: grantTypes,
      }),
    },
    env,
  )
  assert.equal(regRes.status, 201)
  const client = (await regRes.json()) as {
    client_id: string
    client_secret?: string
    token_endpoint_auth_method: string
  }

  const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  const codeChallenge = await sha256Base64Url(codeVerifier)
  assert.equal(codeChallenge, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  const authorizeUrl = new URL('https://kindred.example.test/oauth/authorize')
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', client.client_id)
  if (!options?.omitRedirectUriOnAuthorize) {
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  }
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  authorizeUrl.searchParams.set('scope', 'kindred')
  authorizeUrl.searchParams.set('state', 'st_xyz_123')
  if (options?.resource) {
    authorizeUrl.searchParams.set('resource', options.resource)
  }

  const consentRes = await app.request(authorizeUrl.toString(), { method: 'GET' }, env)
  assert.equal(consentRes.status, 200)
  assert.equal(consentRes.headers.get('X-Frame-Options'), 'DENY')
  assert.equal(consentRes.headers.get('Access-Control-Allow-Origin'), null)
  const csp = consentRes.headers.get('Content-Security-Policy') ?? ''
  assert.match(csp, /frame-ancestors 'none'/)
  assert.ok(csp.includes(`form-action 'self' ${new URL(redirectUri).origin}`), `Unexpected CSP: ${csp}`)
  const setCookie = consentRes.headers.get('Set-Cookie') ?? ''
  const cookiePair = setCookie.split(';')[0] ?? ''
  assert.ok(cookiePair.startsWith('kindred_oauth_csrf='))
  const html = await consentRes.text()
  const reqIdMatch = /name="request_id" value="([^"]+)"/.exec(html)
  const csrfMatch = /name="csrf_token" value="([^"]+)"/.exec(html)
  assert.ok(reqIdMatch?.[1])
  assert.ok(csrfMatch?.[1])

  const approveForm = new URLSearchParams({
    request_id: reqIdMatch[1],
    csrf_token: csrfMatch[1],
    decision: 'approve',
  })
  const approveRes = await app.request(
    'https://kindred.example.test/oauth/authorize',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookiePair,
      },
      body: approveForm.toString(),
    },
    env,
  )
  assert.equal(approveRes.status, 302)
  const location = new URL(approveRes.headers.get('Location') ?? '')
  assert.equal(location.origin + location.pathname, redirectUri)
  assert.equal(location.searchParams.get('state'), 'st_xyz_123')
  assert.equal(location.searchParams.get('iss'), 'https://kindred.example.test')
  const code = location.searchParams.get('code')
  assert.ok(code)

  const tokenForm = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
  })
  if (!options?.omitRedirectUriOnToken) {
    tokenForm.set('redirect_uri', redirectUri)
  }
  const tokenHeaders: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (authMethod === 'client_secret_basic' && client.client_secret) {
    tokenHeaders.Authorization = `Basic ${btoa(`${encodeURIComponent(client.client_id)}:${encodeURIComponent(client.client_secret)}`)}`
  } else {
    tokenForm.set('client_id', client.client_id)
    if (authMethod === 'client_secret_post' && client.client_secret) {
      tokenForm.set('client_secret', client.client_secret)
    }
  }
  if (options?.resource) {
    tokenForm.set('resource', options.resource)
  }

  const tokenRes = await app.request(
    'https://kindred.example.test/oauth/token',
    {
      method: 'POST',
      headers: tokenHeaders,
      body: tokenForm.toString(),
    },
    env,
  )
  assert.equal(tokenRes.status, 200)
  assert.equal(tokenRes.headers.get('Cache-Control'), 'no-store')
  const tokenBody = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    token_type: string
    expires_in: number
    scope: string
  }
  assert.equal(tokenBody.token_type, 'Bearer')
  assert.equal(tokenBody.scope, 'kindred')
  assert.ok(tokenBody.access_token.startsWith('knd_'))
  if (grantTypes.includes('refresh_token')) {
    assert.ok(tokenBody.refresh_token?.startsWith('kndr_'))
  } else {
    assert.equal(tokenBody.refresh_token, undefined)
  }

  return {
    client,
    code,
    codeVerifier,
    redirectUri,
    requestId: reqIdMatch[1],
    csrfToken: csrfMatch[1],
    cookiePair,
    ...tokenBody,
  }
}

describe('Streamable HTTP MCP, anonymous OAuth 2.1, CORS, and route boundary compliance', () => {
  test('unauthenticated /mcp returns 401 WWW-Authenticate OAuth challenge and CORS exposes WWW-Authenticate', async () => {
    const env = makeEnv()

    const unauthPost = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      },
      env,
    )
    assert.equal(unauthPost.status, 401)
    assert.equal(unauthPost.headers.get('Cache-Control'), 'no-store')
    assert.match(
      unauthPost.headers.get('WWW-Authenticate') ?? '',
      /Bearer resource_metadata="https:\/\/kindred\.example\.test\/\.well-known\/oauth-protected-resource"/,
    )

    const unauthGet = await app.request('https://kindred.example.test/mcp', { method: 'GET' }, env)
    assert.equal(unauthGet.status, 401)
    assert.match(unauthGet.headers.get('WWW-Authenticate') ?? '', /oauth-protected-resource/)

    const badTokenPost = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer knd_bogus_token' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      },
      env,
    )
    assert.equal(badTokenPost.status, 401)
    assert.match(badTokenPost.headers.get('WWW-Authenticate') ?? '', /error="invalid_token"/)

    const preflight = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://client.example.org',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type, authorization, mcp-protocol-version',
        },
      },
      env,
    )
    assert.equal(preflight.status, 204)
    assert.match(preflight.headers.get('Access-Control-Allow-Headers') ?? '', /Mcp-Protocol-Version/i)
    assert.match(preflight.headers.get('Access-Control-Expose-Headers') ?? '', /WWW-Authenticate/i)
  })

  test('anonymous OAuth 2.1 DCR + PKCE S256 provisions persistent MCP identity, supports refresh rotation, replay revocation, and erase cascade', async () => {
    const env = makeEnv()

    for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      const prmRes = await app.request(`https://kindred.example.test${path}`, { method: 'GET' }, env)
      assert.equal(prmRes.status, 200)
      assert.equal(prmRes.headers.get('Cache-Control'), 'no-store')
      const prm = (await prmRes.json()) as { resource: string; authorization_servers: string[]; scopes_supported: string[] }
      assert.equal(prm.resource, 'https://kindred.example.test/mcp')
      assert.deepEqual(prm.authorization_servers, ['https://kindred.example.test'])
      assert.deepEqual(prm.scopes_supported, ['kindred'])
    }

    const asRes = await app.request('https://kindred.example.test/.well-known/oauth-authorization-server', { method: 'GET' }, env)
    assert.equal(asRes.status, 200)
    const asMeta = (await asRes.json()) as {
      issuer: string
      authorization_endpoint: string
      token_endpoint: string
      registration_endpoint: string
      code_challenge_methods_supported: string[]
      client_id_metadata_document_supported: boolean
    }
    assert.equal(asMeta.issuer, 'https://kindred.example.test')
    assert.equal(asMeta.authorization_endpoint, 'https://kindred.example.test/oauth/authorize')
    assert.equal(asMeta.token_endpoint, 'https://kindred.example.test/oauth/token')
    assert.equal(asMeta.registration_endpoint, 'https://kindred.example.test/oauth/register')
    assert.deepEqual(asMeta.code_challenge_methods_supported, ['S256'])
    assert.equal(asMeta.client_id_metadata_document_supported, true)

    const session = await runAnonymousOAuthFlow(env, { resource: 'https://kindred.example.test/mcp' })

    const authGet = await app.request(
      'https://kindred.example.test/mcp',
      { method: 'GET', headers: { Authorization: `Bearer ${session.access_token}` } },
      env,
    )
    assert.equal(authGet.status, 405)
    assert.equal(authGet.headers.get('Allow'), 'POST, OPTIONS')

    const badJson = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: '{not-valid-json',
      },
      env,
    )
    assert.equal(badJson.status, 400)
    assert.equal(((await badJson.json()) as { error?: { code?: number } }).error?.code, -32700)

    const notif = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }),
      },
      env,
    )
    assert.equal(notif.status, 202)

    const emptyBatch = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify([]),
      },
      env,
    )
    assert.equal(emptyBatch.status, 400)

    const batchRes = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify([
          { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          { jsonrpc: '2.0', id: 2, method: 'tools/list' },
          { jsonrpc: '2.0', id: 3, method: 'prompts/list' },
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
        prompts?: Array<{ name: string }>
      }
    }>
    assert.equal(items.length, 3)
    assert.equal(items[0]?.result?.protocolVersion, '2025-03-26')
    assert.equal(items[0]?.result?.serverInfo?.version, '2.4.0')
    assert.ok(items[0]?.result?.capabilities?.prompts)
    assert.ok(items[0]?.result?.instructions?.includes('kindred_guide'))
    assert.equal(items[1]?.result?.tools?.length, 13)
    assert.deepEqual(
      items[2]?.result?.prompts?.map((p) => p.name),
      ['start_kindred', 'upgrade_kindred'],
    )

    const guideCall = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
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
    const guidePayload = (await guideCall.json()) as {
      result?: { isError?: boolean; structuredContent?: { current_skill_version?: number; seeds?: unknown[] } }
    }
    assert.equal(guidePayload.result?.isError, false)
    assert.equal(guidePayload.result?.structuredContent?.current_skill_version, 2)
    assert.equal(guidePayload.result?.structuredContent?.seeds?.length, 8)

    const prePublishInbox = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 21,
          method: 'tools/call',
          params: { name: 'kindred_inbox', arguments: {} },
        }),
      },
      env,
    )
    const preInboxBody = (await prePublishInbox.json()) as {
      result?: {
        isError?: boolean
        structuredContent?: {
          agent_id?: string
          quiz_ready?: boolean
          my_quiz?: unknown
          pool_status?: { in_pool?: boolean }
          opening_sparks?: unknown[]
          next_step?: string
        }
      }
    }
    assert.equal(preInboxBody.result?.isError, false)
    assert.equal(preInboxBody.result?.structuredContent?.quiz_ready, false)
    assert.equal(preInboxBody.result?.structuredContent?.my_quiz, null)
    assert.equal(preInboxBody.result?.structuredContent?.pool_status?.in_pool, false)
    assert.equal(preInboxBody.result?.structuredContent?.opening_sparks?.length, 8)
    assert.ok(preInboxBody.result?.structuredContent?.next_step?.includes('kindred_publish_quiz'))
    const oauthAgentId = preInboxBody.result?.structuredContent?.agent_id
    assert.ok(oauthAgentId)

    const firstPublish = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 22,
          method: 'tools/call',
          params: { name: 'kindred_publish_quiz', arguments: { questions: sampleQuestions('oauth-v1') } },
        }),
      },
      env,
    )
    const firstPubBody = (await firstPublish.json()) as {
      result?: {
        isError?: boolean
        structuredContent?: {
          agent_id?: string
          agent_token?: string
          mcp_url?: string
          quiz_version?: number
          upgraded?: boolean
        }
      }
    }
    assert.equal(firstPubBody.result?.isError, false)
    assert.equal(firstPubBody.result?.structuredContent?.agent_id, oauthAgentId)
    assert.equal(firstPubBody.result?.structuredContent?.agent_token, undefined)
    assert.equal(firstPubBody.result?.structuredContent?.mcp_url, 'https://kindred.example.test/mcp')
    assert.equal(firstPubBody.result?.structuredContent?.quiz_version, 1)
    assert.equal(firstPubBody.result?.structuredContent?.upgraded, false)

    const spoofArgRes = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 23,
          method: 'tools/call',
          params: { name: 'kindred_inbox', arguments: { agent_token: 'knd_other_agent_token' } },
        }),
      },
      env,
    )
    const spoofBody = (await spoofArgRes.json()) as { result?: { isError?: boolean } }
    assert.equal(spoofBody.result?.isError, true)

    const secondPublish = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 24,
          method: 'tools/call',
          params: { name: 'kindred_publish_quiz', arguments: { questions: sampleQuestions('oauth-v2') } },
        }),
      },
      env,
    )
    const secondPubBody = (await secondPublish.json()) as {
      result?: { isError?: boolean; structuredContent?: { quiz_version?: number; upgraded?: boolean } }
    }
    assert.equal(secondPubBody.result?.isError, false)
    assert.equal(secondPubBody.result?.structuredContent?.quiz_version, 2)
    assert.equal(secondPubBody.result?.structuredContent?.upgraded, true)

    const refreshRes = await app.request(
      'https://kindred.example.test/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: session.client.client_id,
          refresh_token: session.refresh_token!,
        }).toString(),
      },
      env,
    )
    assert.equal(refreshRes.status, 200)
    const rotated = (await refreshRes.json()) as { access_token: string; refresh_token: string }
    assert.notEqual(rotated.access_token, session.access_token)
    assert.notEqual(rotated.refresh_token, session.refresh_token)

    const oldTokenAfterRotate = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 25, method: 'ping' }),
      },
      env,
    )
    assert.equal(oldTokenAfterRotate.status, 401)

    const newTokenInbox = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rotated.access_token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 26,
          method: 'tools/call',
          params: { name: 'kindred_inbox', arguments: { max_new: 0 } },
        }),
      },
      env,
    )
    const newInboxBody = (await newTokenInbox.json()) as {
      result?: {
        structuredContent?: {
          agent_id?: string
          current_quiz_version?: number
          quiz_ready?: boolean
          my_quiz?: {
            quiz_version?: number
            published_count?: number
            questions?: Array<{ prompt: string; owner_choice: string }>
          }
          pool_status?: { in_pool?: boolean; quiz_version?: number; published_count?: number }
        }
      }
    }
    assert.equal(newInboxBody.result?.structuredContent?.agent_id, oauthAgentId)
    assert.equal(newInboxBody.result?.structuredContent?.current_quiz_version, 2)
    assert.equal(newInboxBody.result?.structuredContent?.quiz_ready, true)
    assert.equal(newInboxBody.result?.structuredContent?.my_quiz?.quiz_version, 2)
    assert.equal(newInboxBody.result?.structuredContent?.my_quiz?.published_count, 3)
    assert.equal(newInboxBody.result?.structuredContent?.my_quiz?.questions?.[0]?.prompt, 'oauth-v2 evening habit question 1?')
    assert.equal(newInboxBody.result?.structuredContent?.pool_status?.in_pool, true)
    assert.equal(newInboxBody.result?.structuredContent?.pool_status?.published_count, 3)

    const replayRefresh = await app.request(
      'https://kindred.example.test/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: session.client.client_id,
          refresh_token: session.refresh_token!,
        }).toString(),
      },
      env,
    )
    assert.equal(replayRefresh.status, 400)
    assert.equal(((await replayRefresh.json()) as { error?: string }).error, 'invalid_grant')

    const revokedAfterReplay = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rotated.access_token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 27, method: 'ping' }),
      },
      env,
    )
    assert.equal(revokedAfterReplay.status, 401)

    const eraseSession = await runAnonymousOAuthFlow(env)
    const eraseCall = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${eraseSession.access_token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 28,
          method: 'tools/call',
          params: { name: 'kindred_erase', arguments: {} },
        }),
      },
      env,
    )
    assert.equal(eraseCall.status, 200)
    assert.equal(((await eraseCall.json()) as { result?: { isError?: boolean } }).result?.isError, false)

    const afterEraseMcp = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${eraseSession.access_token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 29, method: 'ping' }),
      },
      env,
    )
    assert.equal(afterEraseMcp.status, 401)
  })

  test('OAuth 2.1 enforces redirect URI safety, CSRF, PKCE S256, code replay revocation, confidential client auth, revocation, and legacy HTTP token compatibility', async () => {
    const env = makeEnv()

    for (const badUri of [
      'http://evil.example/cb',
      'https://169.254.169.254/latest/meta-data',
      'https://agent.meta.ai/cb#frag',
      'javascript:alert(1)',
    ]) {
      const badReg = await app.request(
        'https://kindred.example.test/oauth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redirect_uris: [badUri] }),
        },
        env,
      )
      assert.equal(badReg.status, 400, `Expected 400 for redirect URI ${badUri}`)
    }

    const session = await runAnonymousOAuthFlow(env, {
      redirectUri: 'http://127.0.0.1/callback',
      authMethod: 'client_secret_basic',
    })

    const mismatchRedirect = await app.request(
      `https://kindred.example.test/oauth/authorize?response_type=code&client_id=${encodeURIComponent(session.client.client_id)}&redirect_uri=${encodeURIComponent('https://evil.example/steal')}&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256`,
      { method: 'GET' },
      env,
    )
    assert.equal(mismatchRedirect.status, 400)
    assert.equal(mismatchRedirect.headers.get('Location'), null)

    const badResource = await app.request(
      `https://kindred.example.test/oauth/authorize?response_type=code&client_id=${encodeURIComponent(session.client.client_id)}&redirect_uri=${encodeURIComponent('http://127.0.0.1:43210/callback')}&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256&resource=${encodeURIComponent('https://other.example/mcp')}&state=s1`,
      { method: 'GET' },
      env,
    )
    assert.equal(badResource.status, 400)
    assert.equal(badResource.headers.get('Location'), null)

    const missingCsrfPost = await app.request(
      'https://kindred.example.test/oauth/authorize',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          request_id: session.requestId,
          csrf_token: session.csrfToken,
          decision: 'approve',
        }).toString(),
      },
      env,
    )
    assert.equal(missingCsrfPost.status, 400)

    const unverifiedCodeReplay = await app.request(
      'https://kindred.example.test/oauth/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${btoa(`${encodeURIComponent(session.client.client_id)}:${encodeURIComponent(session.client.client_secret!)}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: session.code,
          redirect_uri: session.redirectUri,
          code_verifier: 'wrong_verifier_abcdefghijklmnopqrstuvwxyz_0123456789',
        }).toString(),
      },
      env,
    )
    assert.equal(unverifiedCodeReplay.status, 400)
    const stillValidAfterBadReplay = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 29, method: 'ping' }),
      },
      env,
    )
    assert.equal(stillValidAfterBadReplay.status, 200)

    const unauthRevoke = await app.request(
      'https://kindred.example.test/oauth/revoke',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: session.access_token }).toString(),
      },
      env,
    )
    assert.equal(unauthRevoke.status, 400)
    const stillValidAfterUnauthRevoke = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 300, method: 'ping' }),
      },
      env,
    )
    assert.equal(stillValidAfterUnauthRevoke.status, 200)

    const oauthInQueryRejected = await app.request(
      `https://kindred.example.test/mcp?token=${encodeURIComponent(session.access_token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 301, method: 'ping' }),
      },
      env,
    )
    assert.equal(oauthInQueryRejected.status, 401)

    const oauthOnDirectQuizRejected = await app.request(
      'https://kindred.example.test/api/quiz',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
      env,
    )
    assert.equal(oauthOnDirectQuizRejected.status, 401)

    const oauthOnDirectApiRejected = await app.request(
      'https://kindred.example.test/api/agent',
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
      env,
    )
    assert.equal(oauthOnDirectApiRejected.status, 401)

    const codeReplay = await app.request(
      'https://kindred.example.test/oauth/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${btoa(`${encodeURIComponent(session.client.client_id)}:${encodeURIComponent(session.client.client_secret!)}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: session.code,
          redirect_uri: session.redirectUri,
          code_verifier: session.codeVerifier,
        }).toString(),
      },
      env,
    )
    assert.equal(codeReplay.status, 400)
    assert.equal(((await codeReplay.json()) as { error?: string }).error, 'invalid_grant')

    const revokedByCodeReplay = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 30, method: 'ping' }),
      },
      env,
    )
    assert.equal(revokedByCodeReplay.status, 401)

    const omittedRedirectSession = await runAnonymousOAuthFlow(env, {
      redirectUri: 'http://127.0.0.1:45123/cb',
      omitRedirectUriOnAuthorize: true,
      omitRedirectUriOnToken: true,
      grantTypes: ['authorization_code'],
    })
    assert.equal(omittedRedirectSession.refresh_token, undefined)

    const defaultRegRes = await app.request(
      'https://kindred.example.test/oauth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirect_uris: ['https://example.org/cb'] }),
      },
      env,
    )
    assert.equal(defaultRegRes.status, 201)
    const defaultReg = (await defaultRegRes.json()) as {
      token_endpoint_auth_method: string
      client_secret?: string
      grant_types: string[]
    }
    assert.equal(defaultReg.token_endpoint_auth_method, 'client_secret_basic')
    assert.ok(defaultReg.client_secret?.startsWith('kndcs_'))
    assert.deepEqual(defaultReg.grant_types, ['authorization_code'])

    const oversizedStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(10_000).fill(97))
        controller.close()
      },
    })
    const oversizedReg = await app.request(
      'https://kindred.example.test/oauth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: oversizedStream,
      },
      env,
    )
    assert.equal(oversizedReg.status, 400)

    const raceSession = await runAnonymousOAuthFlow(env)
    const makeRefreshReq = () =>
      app.request(
        'https://kindred.example.test/oauth/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: raceSession.client.client_id,
            refresh_token: raceSession.refresh_token!,
          }).toString(),
        },
        env,
      )
    const [r1, r2] = await Promise.all([makeRefreshReq(), makeRefreshReq()])
    const statuses = [r1.status, r2.status].sort()
    assert.deepEqual(statuses, [200, 400])
    const winnerRes = r1.status === 200 ? r1 : r2
    const winnerBody = (await winnerRes.json()) as { access_token: string }
    const winnerRevokedAfterRace = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${winnerBody.access_token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 305, method: 'ping' }),
      },
      env,
    )
    assert.equal(winnerRevokedAfterRace.status, 401)

    const originalFetch = globalThis.fetch
    let observedRedirectMode: string | undefined
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const targetUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      observedRedirectMode = init?.redirect
      if (targetUrl === 'https://chatgpt.com/oauth/client.json') {
        return new Response(
          JSON.stringify({
            client_id: 'https://chatgpt.com/oauth/client.json',
            client_name: 'ChatGPT',
            redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
            token_endpoint_auth_method: 'private_key_jwt',
            token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
            grant_types: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:jwt-bearer'],
            response_types: ['code'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(null, { status: 302, headers: { Location: 'https://evil.example/meta.json' } })
    }) as typeof fetch
    try {
      const cimdAuthorize = await app.request(
        `https://kindred.example.test/oauth/authorize?response_type=code&client_id=${encodeURIComponent('https://chatgpt.com/oauth/client.json')}&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256`,
        { method: 'GET' },
        env,
      )
      assert.equal(observedRedirectMode, 'manual')
      assert.equal(cimdAuthorize.status, 200)
      assert.ok(
        (cimdAuthorize.headers.get('Content-Security-Policy') ?? '').includes(
          "form-action 'self' https://chatgpt.com",
        ),
      )

      const cimdRedirectRejected = await app.request(
        `https://kindred.example.test/oauth/authorize?response_type=code&client_id=${encodeURIComponent('https://redir.example/client.json')}&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256`,
        { method: 'GET' },
        env,
      )
      assert.equal(cimdRedirectRejected.status, 400)
    } finally {
      globalThis.fetch = originalFetch
    }

    const revocable = await runAnonymousOAuthFlow(env)
    const revokeRes = await app.request(
      'https://kindred.example.test/oauth/revoke',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: revocable.access_token, client_id: revocable.client.client_id }).toString(),
      },
      env,
    )
    assert.equal(revokeRes.status, 200)
    const afterRevoke = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${revocable.access_token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 31, method: 'ping' }),
      },
      env,
    )
    assert.equal(afterRevoke.status, 401)

    const legacyQuizRes = await app.request(
      'https://kindred.example.test/api/quiz',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: sampleQuestions('legacy') }),
      },
      env,
    )
    assert.equal(legacyQuizRes.status, 201)
    const legacyQuiz = (await legacyQuizRes.json()) as { agent_id: string; agent_token: string }
    const legacyUpgradeMcp = await app.request(
      `https://kindred.example.test/mcp?token=${encodeURIComponent(legacyQuiz.agent_token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 32,
          method: 'tools/call',
          params: { name: 'kindred_publish_quiz', arguments: { questions: sampleQuestions('legacy-v2') } },
        }),
      },
      env,
    )
    assert.equal(legacyUpgradeMcp.status, 200)
    const legacyUpgradeBody = (await legacyUpgradeMcp.json()) as {
      result?: { structuredContent?: { agent_id?: string; mcp_url?: string; quiz_version?: number } }
    }
    assert.equal(legacyUpgradeBody.result?.structuredContent?.agent_id, legacyQuiz.agent_id)
    assert.equal(legacyUpgradeBody.result?.structuredContent?.quiz_version, 2)
    assert.equal(legacyUpgradeBody.result?.structuredContent?.mcp_url, 'https://kindred.example.test/mcp')

    const legacyReadBackRes = await app.request(
      'https://kindred.example.test/api/quiz',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${legacyQuiz.agent_token}` },
      },
      env,
    )
    assert.equal(legacyReadBackRes.status, 200)
    assert.equal(legacyReadBackRes.headers.get('Cache-Control'), 'no-store')
    const legacyReadBack = (await legacyReadBackRes.json()) as {
      agent_id: string
      quiz_version: number
      published_count: number
      questions: Array<{ prompt: string; owner_choice: string }>
    }
    assert.equal(legacyReadBack.agent_id, legacyQuiz.agent_id)
    assert.equal(legacyReadBack.quiz_version, 2)
    assert.equal(legacyReadBack.published_count, 3)
    assert.equal(legacyReadBack.questions[0]?.prompt, 'legacy-v2 evening habit question 1?')
  })

  test('inbox surfaces waiting pool_status, partner notes, and revealed Phase 2 draw rounds in partner_updates without swallowing completions', async () => {
    const env = makeEnv()

    const pubARes = await app.request(
      'https://kindred.example.test/api/quiz',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: sampleQuestions('alpha') }),
      },
      env,
    )
    assert.equal(pubARes.status, 201)
    const agentA = (await pubARes.json()) as { agent_id: string; agent_token: string }

    const pubBRes = await app.request(
      'https://kindred.example.test/api/quiz',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: sampleQuestions('beta') }),
      },
      env,
    )
    assert.equal(pubBRes.status, 201)
    const agentB = (await pubBRes.json()) as {
      agent_id: string
      agent_token: string
      initial_quiz: { pairing_id: string; questions: Array<{ id: string }> }
    }
    const pairingId = agentB.initial_quiz.pairing_id

    const inboxAPending = (await (
      await app.request('https://kindred.example.test/api/inbox?max_new=0', {
        headers: { Authorization: `Bearer ${agentA.agent_token}` },
      }, env)
    ).json()) as { pending_quizzes: Array<{ pairing_id: string; questions: Array<{ id: string }> }> }
    assert.equal(inboxAPending.pending_quizzes.length, 1)

    await app.request(
      `https://kindred.example.test/api/pairings/${pairingId}/agent-answers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agentA.agent_token}` },
        body: JSON.stringify({
          answers: inboxAPending.pending_quizzes[0]!.questions.map((q) => ({ question_id: q.id, choice: 'U' })),
        }),
      },
      env,
    )

    const inboxAWaitingAgent = (await (
      await app.request('https://kindred.example.test/api/inbox?max_new=0', {
        headers: { Authorization: `Bearer ${agentA.agent_token}` },
      }, env)
    ).json()) as { pool_status: { waiting_on_partner_agent_count: number; waiting_on_partner_human_count: number } }
    assert.equal(inboxAWaitingAgent.pool_status.waiting_on_partner_agent_count, 1)

    const myQuizA = (await (
      await app.request('https://kindred.example.test/api/quiz', {
        headers: { Authorization: `Bearer ${agentA.agent_token}` },
      }, env)
    ).json()) as { questions: Array<{ id: string; owner_choice: string }> }

    await app.request(
      `https://kindred.example.test/api/pairings/${pairingId}/agent-answers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agentB.agent_token}` },
        body: JSON.stringify({
          answers: myQuizA.questions.map((q) => ({ question_id: q.id, choice: q.owner_choice })),
        }),
      },
      env,
    )

    const inboxAMatchReady = (await (
      await app.request('https://kindred.example.test/api/inbox?max_new=0', {
        headers: { Authorization: `Bearer ${agentA.agent_token}` },
      }, env)
    ).json()) as {
      ready_for_human: Array<{ pairing_id: string; questions: Array<{ id: string }> }>
      partner_updates: Array<{ kind: string; pairing_id: string }>
    }
    assert.equal(inboxAMatchReady.partner_updates.some((u) => u.kind === 'match_ready' && u.pairing_id === pairingId), true)

    await app.request(
      `https://kindred.example.test/api/pairings/${pairingId}/human-answers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agentA.agent_token}` },
        body: JSON.stringify({
          answers: inboxAMatchReady.ready_for_human[0]!.questions.map((q) => ({ question_id: q.id, choice: 'A' })),
        }),
      },
      env,
    )

    const inboxAWaitingHuman = (await (
      await app.request('https://kindred.example.test/api/inbox?max_new=0', {
        headers: { Authorization: `Bearer ${agentA.agent_token}` },
      }, env)
    ).json()) as { pool_status: { waiting_on_partner_human_count: number } }
    assert.equal(inboxAWaitingHuman.pool_status.waiting_on_partner_human_count, 1)

    await app.request(
      `https://kindred.example.test/api/pairings/${pairingId}/human-answers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agentB.agent_token}` },
        body: JSON.stringify({
          answers: myQuizA.questions.map((q) => ({ question_id: q.id, choice: q.owner_choice })),
        }),
      },
      env,
    )

    await app.request(
      `https://kindred.example.test/api/pairings/${pairingId}/notes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agentB.agent_token}` },
        body: JSON.stringify({ question_id: myQuizA.questions[0]!.id, body: 'This scene felt uncannily familiar' }),
      },
      env,
    )

    const startDrawRes = await app.request(
      `https://kindred.example.test/api/pairings/${pairingId}/draw`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${agentA.agent_token}` },
      },
      env,
    )
    assert.equal(startDrawRes.status, 201)
    const drawGame = (await startDrawRes.json()) as {
      game_id: string
      rounds: Array<{ id: string; role: 'drawer' | 'guesser'; promptOptions?: Array<{ readings: string[] }> }>
    }
    const firstRound = drawGame.rounds[0]!
    const drawerToken = firstRound.role === 'drawer' ? agentA.agent_token : agentB.agent_token
    const guesserToken = firstRound.role === 'drawer' ? agentB.agent_token : agentA.agent_token
    const drawerInboxForPrompts = (await (
      await app.request('https://kindred.example.test/api/inbox?max_new=0', {
        headers: { Authorization: `Bearer ${drawerToken}` },
      }, env)
    ).json()) as { active_draw_turns: Array<{ round: { id: string; promptOptions?: Array<{ readings: string[] }> } }> }
    const chosenWord = drawerInboxForPrompts.active_draw_turns[0]!.round.promptOptions![0]!.readings[0]!

    await app.request(
      `https://kindred.example.test/api/draw/${drawGame.game_id}/rounds/${firstRound.id}/word`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${drawerToken}` },
        body: JSON.stringify({ word: chosenWord }),
      },
      env,
    )
    await app.request(
      `https://kindred.example.test/api/draw/${drawGame.game_id}/rounds/${firstRound.id}/drawing`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${drawerToken}` },
        body: JSON.stringify({
          strokes: [{ color: '#1F1D1A', width: 5, points: [[100, 120], [240, 220]] }],
        }),
      },
      env,
    )
    await app.request(
      `https://kindred.example.test/api/draw/${drawGame.game_id}/rounds/${firstRound.id}/guess`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guesserToken}` },
        body: JSON.stringify({ choice: 'A', reaction: 'Loved this frame' }),
      },
      env,
    )

    const drawerFinalInbox = (await (
      await app.request('https://kindred.example.test/api/inbox?max_new=0', {
        headers: { Authorization: `Bearer ${drawerToken}` },
      }, env)
    ).json()) as {
      revealed_pairings: Array<{
        pairing_id: string
        latest_note_author: string | null
        latest_partner_note: { body: string } | null
      }>
      recent_draw_reveals: Array<{ round: { id: string; status: string; reaction: string | null } }>
      partner_updates: Array<{ kind: string; round_id?: string; body?: string }>
    }
    assert.equal(drawerFinalInbox.recent_draw_reveals.some((r) => r.round.id === firstRound.id && r.round.status === 'revealed'), true)
    assert.equal(drawerFinalInbox.partner_updates.some((u) => u.kind === 'draw_revealed' && u.round_id === firstRound.id), true)

    const agentAFinalInbox = (await (
      await app.request('https://kindred.example.test/api/inbox?max_new=0', {
        headers: { Authorization: `Bearer ${agentA.agent_token}` },
      }, env)
    ).json()) as {
      revealed_pairings: Array<{
        pairing_id: string
        latest_note_author: string | null
        latest_partner_note: { body: string } | null
      }>
      partner_updates: Array<{ kind: string; body?: string }>
    }
    assert.equal(agentAFinalInbox.revealed_pairings[0]?.latest_note_author, 'partner')
    assert.equal(agentAFinalInbox.revealed_pairings[0]?.latest_partner_note?.body, 'This scene felt uncannily familiar')
    assert.equal(agentAFinalInbox.partner_updates.some((u) => u.kind === 'partner_note' && u.body === 'This scene felt uncannily familiar'), true)
    assert.equal(agentAFinalInbox.partner_updates.some((u) => u.kind === 'pairing_revealed'), true)
  })

  test('GET /skill.md, /llms.txt, /.well-known/mcp.json return expected docs while malformed/unknown paths return 404 instead of SPA HTML', async () => {
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
      assert.ok(text.includes('oauth-protected-resource'))
      assert.ok(text.includes('Step 0: Preferred Transport'))
      assert.ok(text.includes('kindred_guide'))
      assert.ok(text.includes('Session Scenario Sparks'))
      assert.ok(text.includes('GET https://kindred.example.test/api/quiz'))
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
      auth?: { type?: string; protected_resource_metadata?: string }
      capabilities?: { tools?: boolean; resources?: boolean; prompts?: boolean }
    }
    assert.equal(manifest.endpoint, 'https://kindred.example.test/mcp')
    assert.equal(manifest.protocol_version, '2025-03-26')
    assert.equal(manifest.auth?.type, 'oauth2')
    assert.equal(
      manifest.auth?.protected_resource_metadata,
      'https://kindred.example.test/.well-known/oauth-protected-resource',
    )
    assert.deepEqual(manifest.capabilities, { tools: true, resources: true, prompts: true })

    const wellKnownHead = await app.request('https://kindred.example.test/.well-known/mcp.json', { method: 'HEAD' }, env)
    assert.equal(wellKnownHead.status, 200)
    assert.equal(await wellKnownHead.text(), '')

    const wranglerConfig = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url)), 'utf-8'),
    ) as { assets?: { run_worker_first?: string[] }; compatibility_flags?: string[] }
    assert.ok(wranglerConfig.assets?.run_worker_first?.includes('/.well-known/*'))
    assert.ok(wranglerConfig.assets?.run_worker_first?.includes('/oauth/*'))
    assert.ok(wranglerConfig.compatibility_flags?.includes('global_fetch_strictly_public'))

    for (const badPath of [
      '/skill.md%EF%BC%8C%E7%84%B6%E5%90%8E',
      '/.well-known/other',
      '/oauth/unknown',
      '/api',
      '/api/none',
      '/mcp/extra',
    ]) {
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
