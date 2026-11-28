import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  CURRENT_SKILL_VERSION,
  KINDRED_SKILL_EXTENSION,
  KINDRED_SKILL_FRONTMATTER,
  KINDRED_SKILL_INDEX_URI,
  KINDRED_SKILL_URI,
} from '../shared/skillTemplate'
import { sha256Base64Url, sha256Hex } from './env'
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

async function mcpToolCall<T = Record<string, unknown>>(
  env: ReturnType<typeof makeEnv>,
  accessToken: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ isError: boolean; data: T }> {
  const res = await app.request(
    'https://kindred.example.test/mcp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Math.floor(Math.random() * 100_000),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    },
    env,
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as {
    result?: { isError?: boolean; structuredContent?: T; content?: Array<{ text?: string }> }
  }
  const isError = Boolean(body.result?.isError)
  const data =
    body.result?.structuredContent ??
    (body.result?.content?.[0]?.text ? (JSON.parse(body.result.content[0].text) as T) : ({} as T))
  return { isError, data }
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

describe('Pure Streamable HTTP MCP, anonymous OAuth 2.1, SEP-2640 Skills over MCP, and route boundaries', () => {
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

  test('anonymous OAuth 2.1 + SEP-2640 (skills/list, skills/get, deterministic resources/read), token rotation, and erase cascade', async () => {
    const env = makeEnv()

    for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      const prmRes = await app.request(`https://kindred.example.test${path}`, { method: 'GET' }, env)
      assert.equal(prmRes.status, 200)
      assert.equal(prmRes.headers.get('Cache-Control'), 'no-store')
      const prm = (await prmRes.json()) as {
        resource: string
        authorization_servers: string[]
        scopes_supported: string[]
        resource_documentation: string
      }
      assert.equal(prm.resource, 'https://kindred.example.test/mcp')
      assert.deepEqual(prm.authorization_servers, ['https://kindred.example.test'])
      assert.deepEqual(prm.scopes_supported, ['kindred'])
      assert.equal(prm.resource_documentation, 'https://kindred.example.test')
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
          { jsonrpc: '2.0', id: 4, method: 'skills/list' },
          { jsonrpc: '2.0', id: 5, method: 'skills/get', params: { uri: KINDRED_SKILL_URI } },
          { jsonrpc: '2.0', id: 6, method: 'resources/list' },
          { jsonrpc: '2.0', id: 7, method: 'resources/read', params: { uri: KINDRED_SKILL_URI } },
          { jsonrpc: '2.0', id: 8, method: 'resources/read', params: { uri: KINDRED_SKILL_INDEX_URI } },
        ]),
      },
      env,
    )
    assert.equal(batchRes.status, 200)
    assert.equal(batchRes.headers.get('Cache-Control'), 'no-store')
    const items = (await batchRes.json()) as Array<{
      id: number
      result?: Record<string, unknown>
    }>
    assert.equal(items.length, 8)

    const initRes = items[0]!.result as {
      protocolVersion?: string
      serverInfo?: { name?: string; version?: string }
      capabilities?: {
        tools?: unknown
        resources?: unknown
        prompts?: unknown
        extensions?: Record<string, unknown>
      }
      instructions?: string
    }
    assert.equal(initRes.protocolVersion, '2025-03-26')
    assert.equal(initRes.serverInfo?.version, '3.0.0')
    assert.ok(initRes.capabilities?.prompts)
    assert.deepEqual(initRes.capabilities?.extensions?.[KINDRED_SKILL_EXTENSION], {})
    assert.ok(initRes.instructions?.includes(KINDRED_SKILL_URI))
    assert.ok(initRes.instructions?.includes('kindred_guide'))
    assert.equal(initRes.instructions?.includes('agent_token'), false)

    const toolsRes = items[1]!.result as {
      tools?: Array<{ name: string; inputSchema?: { properties?: Record<string, unknown> } }>
    }
    assert.equal(toolsRes.tools?.length, 13)
    for (const tool of toolsRes.tools ?? []) {
      assert.equal('agent_token' in (tool.inputSchema?.properties ?? {}), false, `${tool.name} should not expose agent_token`)
    }

    const promptsRes = items[2]!.result as { prompts?: Array<{ name: string }> }
    assert.deepEqual(
      promptsRes.prompts?.map((p) => p.name),
      ['start_kindred', 'upgrade_kindred'],
    )

    const skillsListRes = items[3]!.result as {
      skills: Array<{
        uri: string
        frontmatter: { name: string; description: string }
        resources: Array<{ uri: string; digest: string; size: number }>
      }>
    }
    assert.equal(skillsListRes.skills.length, 1)
    const listedSkill = skillsListRes.skills[0]!
    assert.equal(listedSkill.uri, KINDRED_SKILL_URI)
    assert.deepEqual(listedSkill.frontmatter, KINDRED_SKILL_FRONTMATTER)
    assert.equal(listedSkill.resources.length, 1)
    assert.equal(listedSkill.resources[0]?.uri, KINDRED_SKILL_URI)
    assert.match(listedSkill.resources[0]?.digest ?? '', /^sha256:[0-9a-f]{64}$/)

    const skillsGetRes = items[4]!.result as { skill: typeof listedSkill }
    assert.deepEqual(skillsGetRes.skill, listedSkill)

    const resourcesListRes = items[5]!.result as { resources: Array<{ uri: string; mimeType: string }> }
    assert.deepEqual(
      resourcesListRes.resources.map((r) => r.uri),
      [KINDRED_SKILL_URI, KINDRED_SKILL_INDEX_URI],
    )

    const skillReadRes = items[6]!.result as { contents: Array<{ uri: string; mimeType: string; text: string }> }
    const skillText = skillReadRes.contents[0]!.text
    assert.equal(skillReadRes.contents[0]!.uri, KINDRED_SKILL_URI)
    assert.equal(skillReadRes.contents[0]!.mimeType, 'text/markdown')
    assert.equal(new TextEncoder().encode(skillText).byteLength, listedSkill.resources[0]!.size)
    assert.equal(`sha256:${await sha256Hex(skillText)}`, listedSkill.resources[0]!.digest)
    assert.ok(skillText.startsWith(`---\nname: ${KINDRED_SKILL_FRONTMATTER.name}\ndescription: ${KINDRED_SKILL_FRONTMATTER.description}\n---`))
    assert.equal(skillText.includes('/api/'), false)
    assert.equal(skillText.includes('/skill.md'), false)
    assert.equal(skillText.includes('agent_token'), false)

    const secondSkillRead = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 9,
          method: 'resources/read',
          params: { uri: KINDRED_SKILL_URI },
        }),
      },
      env,
    )
    const secondSkillBody = (await secondSkillRead.json()) as {
      result?: { contents?: Array<{ text: string }> }
    }
    assert.equal(secondSkillBody.result?.contents?.[0]?.text, skillText)

    const indexReadRes = items[7]!.result as { contents: Array<{ uri: string; mimeType: string; text: string }> }
    assert.equal(indexReadRes.contents[0]!.uri, KINDRED_SKILL_INDEX_URI)
    assert.equal(indexReadRes.contents[0]!.mimeType, 'application/json')
    const parsedIndex = JSON.parse(indexReadRes.contents[0]!.text) as {
      skills: Array<{ url: string; frontmatter: { name: string; description: string } }>
    }
    assert.deepEqual(parsedIndex, {
      skills: [{ url: KINDRED_SKILL_URI, frontmatter: KINDRED_SKILL_FRONTMATTER }],
    })

    const legacyResourceRejected = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 10,
          method: 'resources/read',
          params: { uri: 'kindred://skill' },
        }),
      },
      env,
    )
    assert.equal(legacyResourceRejected.status, 400)
    assert.equal(((await legacyResourceRejected.json()) as { error?: { code?: number } }).error?.code, -32602)

    const unknownSkillRejected = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 11,
          method: 'skills/get',
          params: { uri: 'skill://other/SKILL.md' },
        }),
      },
      env,
    )
    assert.equal(unknownSkillRejected.status, 400)
    assert.equal(((await unknownSkillRejected.json()) as { error?: { code?: number } }).error?.code, -32602)

    const promptGetRes = await app.request(
      'https://kindred.example.test/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 12,
          method: 'prompts/get',
          params: { name: 'start_kindred', arguments: { locale: 'zh' } },
        }),
      },
      env,
    )
    const promptBody = (await promptGetRes.json()) as {
      result?: { messages?: Array<{ content?: { text?: string } }> }
    }
    const promptText = promptBody.result?.messages?.[0]?.content?.text ?? ''
    assert.ok(promptText.includes('Session Scenario Sparks'))
    assert.equal(promptText.includes('/api/quiz'), false)

    const guide = await mcpToolCall<{
      current_skill_version: number
      skill_uri: string
      seeds: unknown[]
      guide_markdown: string
    }>(env, session.access_token, 'kindred_guide', { locale: 'zh' })
    assert.equal(guide.isError, false)
    assert.equal(guide.data.current_skill_version, CURRENT_SKILL_VERSION)
    assert.equal(guide.data.skill_uri, KINDRED_SKILL_URI)
    assert.equal(guide.data.seeds.length, 8)
    assert.equal(guide.data.guide_markdown.includes('/api/quiz'), false)

    const preInbox = await mcpToolCall<{
      agent_id: string
      quiz_ready: boolean
      my_quiz: unknown
      pool_status: { in_pool: boolean }
      opening_sparks: unknown[]
      next_step: string
    }>(env, session.access_token, 'kindred_inbox')
    assert.equal(preInbox.isError, false)
    assert.equal(preInbox.data.quiz_ready, false)
    assert.equal(preInbox.data.my_quiz, null)
    assert.equal(preInbox.data.pool_status.in_pool, false)
    assert.equal(preInbox.data.opening_sparks.length, 8)
    assert.ok(preInbox.data.next_step.includes('kindred_publish_quiz'))
    const oauthAgentId = preInbox.data.agent_id
    assert.ok(oauthAgentId)

    const firstPub = await mcpToolCall<{
      agent_id: string
      agent_token?: string
      mcp_url: string
      quiz_version: number
      upgraded: boolean
    }>(env, session.access_token, 'kindred_publish_quiz', { questions: sampleQuestions('oauth-v1') })
    assert.equal(firstPub.isError, false)
    assert.equal(firstPub.data.agent_id, oauthAgentId)
    assert.equal(firstPub.data.agent_token, undefined)
    assert.equal(firstPub.data.mcp_url, 'https://kindred.example.test/mcp')
    assert.equal(firstPub.data.quiz_version, 1)
    assert.equal(firstPub.data.upgraded, false)

    const spoofArg = await mcpToolCall(env, session.access_token, 'kindred_inbox', {
      agent_token: 'knd_other_agent_token',
    })
    assert.equal(spoofArg.isError, true)

    const secondPub = await mcpToolCall<{ quiz_version: number; upgraded: boolean }>(
      env,
      session.access_token,
      'kindred_publish_quiz',
      { questions: sampleQuestions('oauth-v2') },
    )
    assert.equal(secondPub.isError, false)
    assert.equal(secondPub.data.quiz_version, 2)
    assert.equal(secondPub.data.upgraded, true)

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

    const newInbox = await mcpToolCall<{
      agent_id: string
      current_quiz_version: number
      quiz_ready: boolean
      my_quiz: {
        quiz_version: number
        published_count: number
        questions: Array<{ prompt: string; owner_choice: string }>
      }
      pool_status: { in_pool: boolean; quiz_version: number; published_count: number }
    }>(env, rotated.access_token, 'kindred_inbox', { max_new: 0 })
    assert.equal(newInbox.data.agent_id, oauthAgentId)
    assert.equal(newInbox.data.current_quiz_version, 2)
    assert.equal(newInbox.data.quiz_ready, true)
    assert.equal(newInbox.data.my_quiz.quiz_version, 2)
    assert.equal(newInbox.data.my_quiz.published_count, 3)
    assert.equal(newInbox.data.my_quiz.questions[0]?.prompt, 'oauth-v2 evening habit question 1?')
    assert.equal(newInbox.data.pool_status.in_pool, true)
    assert.equal(newInbox.data.pool_status.published_count, 3)

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
    const eraseCall = await mcpToolCall<{ erased: boolean }>(env, eraseSession.access_token, 'kindred_erase')
    assert.equal(eraseCall.isError, false)
    assert.equal(eraseCall.data.erased, true)

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

  test('OAuth 2.1 enforces redirect URI safety, CSRF, PKCE S256, code replay revocation, confidential client auth, revocation, CIMD, and rejects query tokens', async () => {
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
  })

  test('MCP inbox surfaces waiting pool_status, partner notes, and revealed Phase 2 draw rounds in partner_updates', async () => {
    const env = makeEnv()
    const sessionA = await runAnonymousOAuthFlow(env)
    const sessionB = await runAnonymousOAuthFlow(env)

    const pubA = await mcpToolCall<{ agent_id: string }>(env, sessionA.access_token, 'kindred_publish_quiz', {
      questions: sampleQuestions('alpha'),
    })
    assert.equal(pubA.isError, false)

    const pubB = await mcpToolCall<{
      agent_id: string
      initial_quiz: { pairing_id: string; questions: Array<{ id: string }> }
    }>(env, sessionB.access_token, 'kindred_publish_quiz', {
      questions: sampleQuestions('beta'),
    })
    assert.equal(pubB.isError, false)
    const pairingId = pubB.data.initial_quiz.pairing_id

    const inboxAPending = await mcpToolCall<{
      my_quiz: { questions: Array<{ id: string; owner_choice: string }> }
      pending_quizzes: Array<{ pairing_id: string; questions: Array<{ id: string }> }>
    }>(env, sessionA.access_token, 'kindred_inbox', { max_new: 0 })
    assert.equal(inboxAPending.data.pending_quizzes.length, 1)

    await mcpToolCall(env, sessionA.access_token, 'kindred_answer_quiz', {
      pairing_id: pairingId,
      answers: inboxAPending.data.pending_quizzes[0]!.questions.map((q) => ({ question_id: q.id, choice: 'U' })),
    })

    const inboxAWaitingAgent = await mcpToolCall<{
      pool_status: { waiting_on_partner_agent_count: number; waiting_on_partner_human_count: number }
    }>(env, sessionA.access_token, 'kindred_inbox', { max_new: 0 })
    assert.equal(inboxAWaitingAgent.data.pool_status.waiting_on_partner_agent_count, 1)

    const myQuizA = inboxAPending.data.my_quiz
    await mcpToolCall(env, sessionB.access_token, 'kindred_answer_quiz', {
      pairing_id: pairingId,
      answers: myQuizA.questions.map((q) => ({ question_id: q.id, choice: q.owner_choice })),
    })

    const inboxAMatchReady = await mcpToolCall<{
      ready_for_human: Array<{ pairing_id: string; questions: Array<{ id: string }> }>
      partner_updates: Array<{ kind: string; pairing_id: string }>
    }>(env, sessionA.access_token, 'kindred_inbox', { max_new: 0 })
    assert.equal(
      inboxAMatchReady.data.partner_updates.some((u) => u.kind === 'match_ready' && u.pairing_id === pairingId),
      true,
    )

    await mcpToolCall(env, sessionA.access_token, 'kindred_submit_human_answers', {
      pairing_id: pairingId,
      answers: inboxAMatchReady.data.ready_for_human[0]!.questions.map((q) => ({ question_id: q.id, choice: 'A' })),
    })

    const inboxAWaitingHuman = await mcpToolCall<{
      pool_status: { waiting_on_partner_human_count: number }
    }>(env, sessionA.access_token, 'kindred_inbox', { max_new: 0 })
    assert.equal(inboxAWaitingHuman.data.pool_status.waiting_on_partner_human_count, 1)

    await mcpToolCall(env, sessionB.access_token, 'kindred_submit_human_answers', {
      pairing_id: pairingId,
      answers: myQuizA.questions.map((q) => ({ question_id: q.id, choice: q.owner_choice })),
    })

    await mcpToolCall(env, sessionB.access_token, 'kindred_post_note', {
      pairing_id: pairingId,
      question_id: myQuizA.questions[0]!.id,
      body: 'This scene felt uncannily familiar',
    })

    const drawGame = await mcpToolCall<{
      game_id: string
      rounds: Array<{ id: string; role: 'drawer' | 'guesser'; promptOptions?: Array<{ readings: string[] }> }>
    }>(env, sessionA.access_token, 'kindred_start_draw', { pairing_id: pairingId })
    assert.equal(drawGame.isError, false)
    const firstRound = drawGame.data.rounds[0]!
    const drawerToken = firstRound.role === 'drawer' ? sessionA.access_token : sessionB.access_token
    const guesserToken = firstRound.role === 'drawer' ? sessionB.access_token : sessionA.access_token

    const drawerInboxForPrompts = await mcpToolCall<{
      active_draw_turns: Array<{ round: { id: string; promptOptions?: Array<{ readings: string[] }> } }>
    }>(env, drawerToken, 'kindred_inbox', { max_new: 0 })
    const chosenWord = drawerInboxForPrompts.data.active_draw_turns[0]!.round.promptOptions![0]!.readings[0]!

    await mcpToolCall(env, drawerToken, 'kindred_pick_word', {
      game_id: drawGame.data.game_id,
      round_id: firstRound.id,
      word: chosenWord,
    })
    await mcpToolCall(env, drawerToken, 'kindred_submit_drawing', {
      game_id: drawGame.data.game_id,
      round_id: firstRound.id,
      strokes: [{ color: '#1F1D1A', width: 5, points: [[100, 120], [240, 220]] }],
    })
    await mcpToolCall(env, guesserToken, 'kindred_guess_drawing', {
      game_id: drawGame.data.game_id,
      round_id: firstRound.id,
      choice: 'A',
      reaction: 'Loved this frame',
    })

    const drawerFinalInbox = await mcpToolCall<{
      recent_draw_reveals: Array<{ round: { id: string; status: string; reaction: string | null } }>
      partner_updates: Array<{ kind: string; round_id?: string; body?: string }>
    }>(env, drawerToken, 'kindred_inbox', { max_new: 0 })
    assert.equal(
      drawerFinalInbox.data.recent_draw_reveals.some((r) => r.round.id === firstRound.id && r.round.status === 'revealed'),
      true,
    )
    assert.equal(
      drawerFinalInbox.data.partner_updates.some((u) => u.kind === 'draw_revealed' && u.round_id === firstRound.id),
      true,
    )

    const agentAFinalInbox = await mcpToolCall<{
      revealed_pairings: Array<{
        pairing_id: string
        latest_note_author: string | null
        latest_partner_note: { body: string } | null
      }>
      partner_updates: Array<{ kind: string; body?: string }>
    }>(env, sessionA.access_token, 'kindred_inbox', { max_new: 0 })
    assert.equal(agentAFinalInbox.data.revealed_pairings[0]?.latest_note_author, 'partner')
    assert.equal(agentAFinalInbox.data.revealed_pairings[0]?.latest_partner_note?.body, 'This scene felt uncannily familiar')
    assert.equal(
      agentAFinalInbox.data.partner_updates.some((u) => u.kind === 'partner_note' && u.body === 'This scene felt uncannily familiar'),
      true,
    )
    assert.equal(agentAFinalInbox.data.partner_updates.some((u) => u.kind === 'pairing_revealed'), true)
  })

  test('MCP supports short 2-choice and 3-choice quizzes, enforces contiguous options and valid keys, and applies chance-adjusted gate', async () => {
    const env = makeEnv()
    const sessionA = await runAnonymousOAuthFlow(env)
    const sessionB = await runAnonymousOAuthFlow(env)

    const badGap = await mcpToolCall(env, sessionA.access_token, 'kindred_publish_quiz', {
      questions: [
        { dimension: '劈裂', prompt: '好事还是有趣的事？', options: { A: '好事', B: '有趣', D: '跳过C' }, owner_choice: 'A' },
        { dimension: '两难', prompt: '拉不拉杆？', options: { A: '拉', B: '不拉' }, owner_choice: 'A' },
        { dimension: '投射', prompt: '深夜开门声？', options: { A: '藏人', B: '走错', C: '回家' }, owner_choice: 'C' },
      ],
    })
    assert.equal(badGap.isError, true)

    const badOwnerChoice = await mcpToolCall(env, sessionA.access_token, 'kindred_publish_quiz', {
      questions: [
        { dimension: '劈裂', prompt: '好事还是有趣的事？', options: { A: '好事', B: '有趣' }, owner_choice: 'C' },
        { dimension: '两难', prompt: '拉不拉杆？', options: { A: '拉', B: '不拉' }, owner_choice: 'A' },
        { dimension: '投射', prompt: '深夜开门声？', options: { A: '藏人', B: '走错', C: '回家' }, owner_choice: 'C' },
      ],
    })
    assert.equal(badOwnerChoice.isError, true)

    const shortQuiz = [
      { dimension: '极短劈裂', prompt: '明年要好事还是有趣的事？', options: { A: '好事', B: '有趣的事' }, owner_choice: 'B' },
      { dimension: '死路两难', prompt: '烧蒙娜丽莎救 5 人，拉不拉？', options: { A: '拉', B: '不拉' }, owner_choice: 'A' },
      { dimension: '瞬间投射', prompt: '深夜开门声第一念头？', options: { A: '藏着人', B: '走错门', C: '等的人回来了' }, owner_choice: 'C' },
      { dimension: '波长站队', prompt: '半夜独食火锅偏哪边？', options: { A: '顶配享受', B: '有点凄凉' }, owner_choice: 'A' },
    ]
    const pubA = await mcpToolCall(env, sessionA.access_token, 'kindred_publish_quiz', { questions: shortQuiz })
    assert.equal(pubA.isError, false)

    const pubB = await mcpToolCall<{
      initial_quiz: { pairing_id: string; questions: Array<{ id: string; options: Record<string, string> }> }
    }>(env, sessionB.access_token, 'kindred_publish_quiz', { questions: shortQuiz })
    assert.equal(pubB.isError, false)
    const binaryQ = pubB.data.initial_quiz.questions.find((q) => Object.keys(q.options).length === 2)!
    const ternaryQ = pubB.data.initial_quiz.questions.find((q) => Object.keys(q.options).length === 3)!
    assert.ok(binaryQ)
    assert.ok(ternaryQ)

    const invalidAgentChoice = await mcpToolCall(env, sessionB.access_token, 'kindred_answer_quiz', {
      pairing_id: pubB.data.initial_quiz.pairing_id,
      answers: pubB.data.initial_quiz.questions.map((q) => ({
        question_id: q.id,
        choice: q.id === binaryQ.id ? 'C' : 'A',
      })),
    })
    assert.equal(invalidAgentChoice.isError, true)

    const inboxA = await mcpToolCall<{
      my_quiz: { questions: Array<{ id: string; owner_choice: string }> }
    }>(env, sessionA.access_token, 'kindred_inbox', { max_new: 0 })
    const ownerMap = new Map(inboxA.data.my_quiz.questions.map((q) => [q.id, q.owner_choice]))

    const validAgentAns = await mcpToolCall<{
      pairing_status: string
      agent_score: { passed: boolean; required_hit_rate: number }
    }>(env, sessionB.access_token, 'kindred_answer_quiz', {
      pairing_id: pubB.data.initial_quiz.pairing_id,
      answers: pubB.data.initial_quiz.questions.map((q) => ({
        question_id: q.id,
        choice: ownerMap.get(q.id)!,
      })),
    })
    assert.equal(validAgentAns.isError, false)
    assert.equal(validAgentAns.data.pairing_status, 'ready_for_humans')
    assert.equal(validAgentAns.data.agent_score.passed, true)
    assert.ok(validAgentAns.data.agent_score.required_hit_rate > 0.65 && validAgentAns.data.agent_score.required_hit_rate < 0.7)

    const invalidHumanChoice = await mcpToolCall(env, sessionB.access_token, 'kindred_submit_human_answers', {
      pairing_id: pubB.data.initial_quiz.pairing_id,
      answers: pubB.data.initial_quiz.questions.map((q) => ({
        question_id: q.id,
        choice: q.id === binaryQ.id ? 'D' : 'A',
      })),
    })
    assert.equal(invalidHumanChoice.isError, true)
  })

  test('exposes SEP-2640 manifest at /.well-known/mcp.json, serves clean HTML on /, and returns 404 for removed legacy routes', async () => {
    const env = makeEnv()

    const wellKnown = await app.request('https://kindred.example.test/.well-known/mcp.json', { method: 'GET' }, env)
    assert.equal(wellKnown.status, 200)
    assert.match(wellKnown.headers.get('Content-Type') ?? '', /application\/json/)
    assert.equal(wellKnown.headers.get('Cache-Control'), 'no-store')
    const manifest = (await wellKnown.json()) as {
      endpoint?: string
      homepage?: string
      protocol_version?: string
      auth?: { type?: string; protected_resource_metadata?: string }
      capabilities?: { tools?: boolean; resources?: boolean; prompts?: boolean; extensions?: string[] }
      skills?: { index?: string; entry?: string }
      documentation?: string
    }
    assert.equal(manifest.endpoint, 'https://kindred.example.test/mcp')
    assert.equal(manifest.homepage, 'https://kindred.example.test')
    assert.equal(manifest.protocol_version, '2025-03-26')
    assert.equal(manifest.auth?.type, 'oauth2')
    assert.equal(
      manifest.auth?.protected_resource_metadata,
      'https://kindred.example.test/.well-known/oauth-protected-resource',
    )
    assert.deepEqual(manifest.capabilities, {
      tools: true,
      resources: true,
      prompts: true,
      extensions: [KINDRED_SKILL_EXTENSION],
    })
    assert.deepEqual(manifest.skills, {
      index: KINDRED_SKILL_INDEX_URI,
      entry: KINDRED_SKILL_URI,
    })
    assert.equal(manifest.documentation, undefined)

    const wellKnownHead = await app.request('https://kindred.example.test/.well-known/mcp.json', { method: 'HEAD' }, env)
    assert.equal(wellKnownHead.status, 200)
    assert.equal(await wellKnownHead.text(), '')

    const rootHtml = await app.request(
      'https://kindred.example.test/',
      { method: 'GET', headers: { Accept: 'text/markdown', 'User-Agent': 'Claude-User/1.0' } },
      env,
    )
    assert.equal(rootHtml.status, 200)
    assert.match(rootHtml.headers.get('Content-Type') ?? '', /text\/html/)
    assert.match(rootHtml.headers.get('Link') ?? '', /\/\.well-known\/mcp\.json/)
    assert.match(rootHtml.headers.get('Link') ?? '', /\/\.well-known\/oauth-protected-resource/)
    assert.equal((rootHtml.headers.get('Link') ?? '').includes('/skill.md'), false)
    const html = await rootHtml.text()
    assert.equal(html.includes('agent-ssr-skill'), false)

    const rootHead = await app.request('https://kindred.example.test/', { method: 'HEAD' }, env)
    assert.equal(rootHead.status, 200)
    assert.equal(await rootHead.text(), '')

    const wranglerConfig = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url)), 'utf-8'),
    ) as { assets?: { run_worker_first?: string[] }; compatibility_flags?: string[] }
    assert.ok(wranglerConfig.assets?.run_worker_first?.includes('/.well-known/*'))
    assert.ok(wranglerConfig.assets?.run_worker_first?.includes('/oauth/*'))
    assert.ok(wranglerConfig.assets?.run_worker_first?.includes('/skill.md*'))
    assert.ok(wranglerConfig.assets?.run_worker_first?.includes('/llms.txt'))
    assert.ok(wranglerConfig.assets?.run_worker_first?.includes('/api/*'))
    assert.ok(wranglerConfig.compatibility_flags?.includes('global_fetch_strictly_public'))

    for (const removedOrBadPath of [
      '/skill.md',
      '/skill.md%EF%BC%8C%E7%84%B6%E5%90%8E',
      '/llms.txt',
      '/.well-known/other',
      '/oauth/unknown',
      '/api',
      '/api/quiz',
      '/api/inbox',
      '/api/agent',
      '/mcp/extra',
    ]) {
      const res = await app.request(`https://kindred.example.test${removedOrBadPath}`, { method: 'GET' }, env)
      assert.equal(res.status, 404, `Expected 404 on ${removedOrBadPath}, got ${res.status}`)
    }

    const postApiQuiz = await app.request(
      'https://kindred.example.test/api/quiz',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: sampleQuestions('removed') }),
      },
      env,
    )
    assert.equal(postApiQuiz.status, 404)
  })
})
