import { Hono, type Context } from 'hono'
import { CURRENT_SKILL_VERSION } from '../shared/skillTemplate'
import { randomToken, sha256Base64Url, sha256Hex, timingSafeEqual, type Env } from './env'

const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000
const AUTH_CODE_TTL_MS = 5 * 60 * 1000
const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
const REFRESH_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60
const CIMD_MAX_BYTES = 16_384
const INBOUND_SMALL_MAX_BYTES = 8_192
const INBOUND_TOKEN_MAX_BYTES = 16_384
const CIMD_TIMEOUT_MS = 4000
const CSRF_COOKIE_NAME = 'kindred_oauth_csrf'
const DEFAULT_SCOPE = 'kindred'
const SUPPORTED_SCOPES = new Set([DEFAULT_SCOPE])
const SUPPORTED_AUTH_METHODS = new Set(['none', 'client_secret_post', 'client_secret_basic'])
const PKCE_VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/
const PKCE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/

interface OAuthClientRecord {
  clientId: string
  clientName: string
  redirectUris: string[]
  tokenEndpointAuthMethod: 'none' | 'client_secret_post' | 'client_secret_basic'
  clientSecretHash: string | null
  grantTypes: string[]
  responseTypes: string[]
  isCimd: boolean
}

interface OAuthClientRow {
  client_id: string
  client_name: string
  redirect_uris_json: string
  token_endpoint_auth_method: 'none' | 'client_secret_post' | 'client_secret_basic'
  client_secret_hash: string | null
  grant_types_json: string
  response_types_json: string
}

interface OAuthAuthRequestRow {
  id: string
  client_id: string
  client_name: string
  redirect_uri: string
  redirect_uri_sent: number
  allow_refresh: number
  code_challenge: string
  scope: string
  state: string | null
  resource: string | null
  csrf_token_hash: string
  expires_at: string
  used_at: string | null
}

interface OAuthCodeRow {
  code_hash: string
  client_id: string
  redirect_uri: string
  redirect_uri_sent: number
  allow_refresh: number
  code_challenge: string
  scope: string
  resource: string | null
  expires_at: string
  used_at: string | null
  consumed_by: string | null
}

interface OAuthTokenRow {
  id: string
  agent_id: string
  client_id: string
  access_token_hash: string
  refresh_token_hash: string | null
  scope: string
  resource: string
  auth_code_hash: string | null
  expires_at: string
  refresh_expires_at: string | null
  revoked_at: string | null
  revoked_by: string | null
}

export function buildProtectedResourceMetadata(origin: string) {
  const base = origin.replace(/\/+$/, '')
  return {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: [DEFAULT_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Kindred',
    resource_documentation: `${base}/skill.md`,
  }
}

export function buildAuthorizationServerMetadata(origin: string) {
  const base = origin.replace(/\/+$/, '')
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: [DEFAULT_SCOPE],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: true,
  }
}

export function buildWwwAuthenticateHeader(
  origin: string,
  error?: string,
  errorDescription?: string,
): string {
  const base = origin.replace(/\/+$/, '')
  const parts = [`resource_metadata="${base}/.well-known/oauth-protected-resource"`, `scope="${DEFAULT_SCOPE}"`]
  if (error) {
    parts.push(`error="${error.replace(/"/g, '')}"`)
  }
  if (errorDescription) {
    parts.push(`error_description="${errorDescription.replace(/"/g, "'")}"`)
  }
  return `Bearer ${parts.join(', ')}`
}

export function canonicalizeResource(origin: string, raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null
  try {
    const parsed = new URL(raw.trim())
    if (parsed.hash || parsed.search || parsed.username || parsed.password) return null
    const base = origin.replace(/\/+$/, '')
    const normalizedPath = parsed.pathname.replace(/\/+$/, '')
    const canonical = `${parsed.origin}${normalizedPath}`
    if (canonical === `${base}/mcp` || canonical === base) {
      return `${base}/mcp`
    }
    return null
  } catch {
    return null
  }
}

async function readBoundedText(
  stream: ReadableStream<Uint8Array> | null,
  contentLengthHeader: string | null | undefined,
  maxBytes: number,
): Promise<string | null> {
  if (contentLengthHeader) {
    const declared = Number(contentLengthHeader)
    if (Number.isFinite(declared) && declared > maxBytes) return null
  }
  if (!stream) return ''
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

function isLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return lower === 'localhost' || lower === '127.0.0.1' || lower === '[::1]' || lower === '::1'
}

function isBlockedPrivateIp(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (lower === '0.0.0.0' || lower === '::' || lower.startsWith('::ffff:')) return true
  if (/^10\./.test(lower)) return true
  if (/^127\./.test(lower)) return true
  if (/^169\.254\./.test(lower)) return true
  if (/^192\.168\./.test(lower)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(lower)) return true
  if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(lower)) return true
  if (/^(fc|fd|fe[89ab])[0-9a-f]{0,2}:/i.test(lower)) return true
  return false
}

function isIpLiteral(hostname: string): boolean {
  const stripped = hostname.replace(/^\[|\]$/g, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(stripped)) return true
  if (stripped.includes(':')) return true
  return false
}

export function isValidRedirectUri(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length < 8 || raw.length > 512) return false
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  if (parsed.hash || parsed.username || parsed.password) return false
  if (parsed.protocol === 'http:') {
    return isLoopbackHost(parsed.hostname)
  }
  if (parsed.protocol === 'https:') {
    if (isLoopbackHost(parsed.hostname)) return true
    if (isBlockedPrivateIp(parsed.hostname)) return false
    return true
  }
  return false
}

export function redirectUriMatches(registered: string, candidate: string): boolean {
  if (registered === candidate) return true
  try {
    const regUrl = new URL(registered)
    const candUrl = new URL(candidate)
    if (
      regUrl.protocol === 'http:' &&
      candUrl.protocol === 'http:' &&
      isLoopbackHost(regUrl.hostname) &&
      regUrl.hostname.toLowerCase() === candUrl.hostname.toLowerCase() &&
      regUrl.pathname === candUrl.pathname &&
      regUrl.search === candUrl.search &&
      !candUrl.hash &&
      !candUrl.username &&
      !candUrl.password
    ) {
      return true
    }
  } catch {
    return false
  }
  return false
}

function isCimdClientId(origin: string, clientId: string): boolean {
  if (!clientId.startsWith('https://') || clientId.length > 512) return false
  let parsed: URL
  try {
    parsed = new URL(clientId)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (parsed.port !== '' || parsed.username || parsed.password || parsed.hash) return false
  if (parsed.pathname === '/' || parsed.pathname.length < 2) return false
  if (parsed.origin === origin.replace(/\/+$/, '')) return false
  const host = parsed.hostname.toLowerCase()
  if (!host.includes('.') || isIpLiteral(host) || isLoopbackHost(host) || isBlockedPrivateIp(host)) {
    return false
  }
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.arpa')) {
    return false
  }
  return true
}

function negotiateCimdAuthMethod(doc: Record<string, unknown>): 'none' | null {
  const candidates = new Set<string>()
  if (Array.isArray(doc.token_endpoint_auth_methods_supported)) {
    for (const m of doc.token_endpoint_auth_methods_supported) {
      if (typeof m === 'string') candidates.add(m)
    }
  }
  if (typeof doc.token_endpoint_auth_method === 'string') {
    candidates.add(doc.token_endpoint_auth_method)
  }
  if (candidates.size === 0) {
    candidates.add('none')
  }
  return candidates.has('none') ? 'none' : null
}

function negotiateCimdGrantTypes(doc: Record<string, unknown>): string[] | null {
  const raw = doc.grant_types
  if (raw === undefined) return ['authorization_code']
  if (!Array.isArray(raw)) return null
  const negotiated: string[] = []
  if (raw.includes('authorization_code')) negotiated.push('authorization_code')
  if (raw.includes('refresh_token')) negotiated.push('refresh_token')
  if (!negotiated.includes('authorization_code')) return null
  return negotiated
}

async function fetchCimdClient(origin: string, clientId: string): Promise<OAuthClientRecord | null> {
  if (!isCimdClientId(origin, clientId)) return null
  let res: Response
  try {
    res = await fetch(clientId, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
    })
  } catch {
    return null
  }
  if (res.status !== 200) {
    await res.body?.cancel().catch(() => {})
    return null
  }
  const contentType = (res.headers.get('Content-Type') ?? '').toLowerCase()
  if (!contentType.includes('application/json')) {
    await res.body?.cancel().catch(() => {})
    return null
  }
  const rawText = await readBoundedText(res.body, res.headers.get('Content-Length'), CIMD_MAX_BYTES)
  if (rawText === null) return null

  let doc: Record<string, unknown>
  try {
    const parsed = JSON.parse(rawText) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    doc = parsed as Record<string, unknown>
  } catch {
    return null
  }

  if (doc.client_id !== clientId) return null
  const authMethod = negotiateCimdAuthMethod(doc)
  if (!authMethod) return null
  const grantTypes = negotiateCimdGrantTypes(doc)
  if (!grantTypes) return null
  if (doc.response_types !== undefined) {
    if (!Array.isArray(doc.response_types) || !doc.response_types.includes('code')) return null
  }
  if (!Array.isArray(doc.redirect_uris) || doc.redirect_uris.length < 1 || doc.redirect_uris.length > 10) {
    return null
  }
  const redirectUris: string[] = []
  for (const item of doc.redirect_uris) {
    if (typeof item !== 'string' || !isValidRedirectUri(item)) return null
    redirectUris.push(item)
  }

  const rawName = typeof doc.client_name === 'string' ? doc.client_name.trim() : ''
  const hostName = new URL(clientId).hostname
  const clientName = (rawName || hostName).slice(0, 120)

  return {
    clientId,
    clientName,
    redirectUris,
    tokenEndpointAuthMethod: authMethod,
    clientSecretHash: null,
    grantTypes,
    responseTypes: ['code'],
    isCimd: true,
  }
}

async function resolveOAuthClient(
  db: D1Database,
  origin: string,
  clientId: string,
  allowCimdFetch = true,
): Promise<OAuthClientRecord | null> {
  if (!clientId || clientId.length > 512) return null
  const row = await db
    .prepare('SELECT * FROM oauth_clients WHERE client_id = ?')
    .bind(clientId)
    .first<OAuthClientRow>()
  if (row) {
    return {
      clientId: row.client_id,
      clientName: row.client_name,
      redirectUris: JSON.parse(row.redirect_uris_json) as string[],
      tokenEndpointAuthMethod: row.token_endpoint_auth_method,
      clientSecretHash: row.client_secret_hash,
      grantTypes: JSON.parse(row.grant_types_json) as string[],
      responseTypes: JSON.parse(row.response_types_json) as string[],
      isCimd: false,
    }
  }
  if (allowCimdFetch) {
    return fetchCimdClient(origin, clientId)
  }
  return null
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function detectConsentLocale(c: Context<{ Bindings: Env }>): 'zh' | 'en' {
  const url = new URL(c.req.url)
  const uiLocales = (url.searchParams.get('ui_locales') ?? '').trim().toLowerCase()
  if (uiLocales.startsWith('en')) return 'en'
  if (uiLocales.startsWith('zh')) return 'zh'
  const acceptLang = (c.req.header('Accept-Language') ?? '').toLowerCase()
  return acceptLang.includes('zh') ? 'zh' : 'en'
}

function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    if (key === name) {
      return decodeURIComponent(part.slice(idx + 1).trim())
    }
  }
  return null
}

function buildToggleLocaleHref(rawUrl: string, targetLocale: 'zh' | 'en'): string {
  const url = new URL(rawUrl)
  url.searchParams.set('ui_locales', targetLocale)
  return `${url.pathname}?${url.searchParams.toString()}`
}

function buildSecurityHeaders(options?: {
  formActionOrigin?: string
  extra?: Record<string, string>
}): Record<string, string> {
  const formAction = options?.formActionOrigin ? `'self' ${options.formActionOrigin}` : "'self'"
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`,
    ...options?.extra,
  }
}

function renderOAuthPageShell(locale: 'zh' | 'en', title: string, bodyHtml: string, toggleHref?: string): string {
  const langAttr = locale === 'zh' ? 'zh-CN' : 'en'
  const toggleHtml = toggleHref
    ? `<a class="lang" href="${escapeHtml(toggleHref)}">${locale === 'zh' ? 'EN' : '中文'}</a>`
    : ''
  return `<!doctype html>
<html lang="${langAttr}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #120e0b;
      --surface: #1b1612;
      --line: rgba(243, 233, 219, 0.14);
      --text: #f4ebdf;
      --text-2: rgba(244, 235, 223, 0.72);
      --text-3: rgba(244, 235, 223, 0.5);
      --ember: #ff6b47;
      --ember-hover: #ff7e5e;
      --moss: #3bd89d;
      --moss-dim: rgba(59, 216, 157, 0.14);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100svh;
      display: grid;
      place-items: center;
      padding: 24px 16px;
      background:
        radial-gradient(680px 420px at 20% 10%, rgba(255, 107, 71, 0.12), transparent 65%),
        radial-gradient(620px 380px at 85% 90%, rgba(59, 216, 157, 0.09), transparent 65%),
        var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      width: 100%;
      max-width: 440px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 28px 26px 24px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
    }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      font-size: 16px;
      letter-spacing: -0.01em;
    }
    .mark {
      width: 28px;
      height: 28px;
      display: inline-block;
    }
    .lang {
      color: var(--text-2);
      text-decoration: none;
      font-size: 13px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--line);
    }
    .lang:hover { color: var(--text); border-color: rgba(243, 233, 219, 0.3); }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      color: var(--moss);
      background: var(--moss-dim);
      padding: 4px 11px;
      border-radius: 999px;
      margin-bottom: 14px;
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--moss);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 22px;
      line-height: 1.3;
      letter-spacing: -0.02em;
    }
    .sub {
      margin: 0 0 18px;
      color: var(--text-2);
      font-size: 14px;
    }
    .client-box {
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--line);
      margin-bottom: 18px;
      font-size: 13px;
    }
    .client-name { font-weight: 600; color: var(--text); word-break: break-word; }
    .client-host { color: var(--text-3); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; margin-top: 2px; word-break: break-all; }
    .points {
      list-style: none;
      padding: 0;
      margin: 0 0 18px;
      display: grid;
      gap: 9px;
    }
    .points li {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      font-size: 13.5px;
      color: var(--text-2);
    }
    .check {
      flex: 0 0 auto;
      color: var(--moss);
      font-weight: 700;
      line-height: 1.5;
    }
    .next-step {
      padding: 11px 13px;
      border-radius: 12px;
      background: rgba(255, 107, 71, 0.09);
      border: 1px solid rgba(255, 107, 71, 0.24);
      margin-bottom: 18px;
      font-size: 13px;
      color: var(--text);
      line-height: 1.55;
    }
    .next-step strong {
      color: #ff9a7f;
      font-weight: 600;
    }
    .actions {
      display: grid;
      gap: 10px;
    }
    button {
      width: 100%;
      min-height: 46px;
      border-radius: 999px;
      font: inherit;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      border: 0;
    }
    .btn-primary {
      background: var(--ember);
      color: #160f0b;
    }
    .btn-primary:hover { background: var(--ember-hover); }
    .btn-secondary {
      background: transparent;
      color: var(--text-2);
      border: 1px solid var(--line);
      font-weight: 500;
    }
    .btn-secondary:hover { color: var(--text); border-color: rgba(243, 233, 219, 0.3); }
    .foot {
      margin-top: 16px;
      text-align: center;
      font-size: 12px;
      color: var(--text-3);
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="top">
      <div class="brand">
        <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#120E0B" />
          <circle cx="12.5" cy="16" r="6.5" fill="#FF6B47" />
          <circle cx="19.5" cy="16" r="6.5" fill="#3BD89D" fill-opacity="0.88" />
        </svg>
        <span>Kindred</span>
      </div>
      ${toggleHtml}
    </div>
    ${bodyHtml}
  </main>
</body>
</html>`
}

function renderConsentHtml(params: {
  locale: 'zh' | 'en'
  clientName: string
  redirectHost: string
  requestId: string
  csrfToken: string
  toggleHref: string
}): string {
  const { locale, clientName, redirectHost, requestId, csrfToken, toggleHref } = params
  const zh = locale === 'zh'
  const title = zh ? '连接 Kindred — 匿名授权' : 'Connect Kindred — Anonymous Access'
  const bodyHtml = `
    <div class="pill"><span class="dot"></span><span>${zh ? '无需注册 · 匿名' : 'No sign-up · Anonymous'}</span></div>
    <h1>${zh ? '允许你的 AI 连上 Kindred' : 'Connect your AI to Kindred'}</h1>
    <p class="sub">${
      zh
        ? '连上后，你的 AI 就能匿名帮你发题、匹配同频的人；下次新开对话也无需重连。'
        : 'Once connected, your AI can publish your quiz and find kindred spirits anonymously—across future chats too.'
    }</p>
    <div class="client-box">
      <div class="client-name">${escapeHtml(clientName)}</div>
      <div class="client-host">${zh ? '回调地址：' : 'Redirects to '}${escapeHtml(redirectHost)}</div>
    </div>
    <ul class="points">
      <li><span class="check">✓</span><span>${
        zh ? '不用注册，不留邮箱、手机号或个人资料' : 'No account—no email, phone number, or profile collected'
      }</span></li>
      <li><span class="check">✓</span><span>${
        zh ? '聊天和记忆留在本地，只发你确认的题和画' : 'Chats and memories stay local; only your reviewed quizzes and drawings leave'
      }</span></li>
      <li><span class="check">✓</span><span>${
        zh ? '随时让 AI 清空全部数据并断开连接' : 'Erase all data and disconnect anytime through your AI'
      }</span></li>
    </ul>
    <div class="next-step">${
      zh
        ? '<strong>下一步：</strong>点完会自动回对话；如果 AI 没接着出题，发一句「开始玩 Kindred」就能继续。'
        : '<strong>Next step:</strong> You’ll return to your chat automatically. If your AI stays quiet, send “Start Kindred” to jump in.'
    }</div>
    <form method="POST" action="/oauth/authorize" class="actions">
      <input type="hidden" name="request_id" value="${escapeHtml(requestId)}" />
      <input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}" />
      <button type="submit" name="decision" value="approve" class="btn-primary">${
        zh ? '匿名连接' : 'Connect Anonymously'
      }</button>
      <button type="submit" name="decision" value="deny" class="btn-secondary">${zh ? '取消' : 'Cancel'}</button>
    </form>
    <div class="foot">${zh ? 'Kindred · AMIO 出品' : 'Kindred · by AMIO'}</div>
  `
  return renderOAuthPageShell(locale, title, bodyHtml, toggleHref)
}

function renderOAuthErrorHtml(locale: 'zh' | 'en', heading: string, detail: string): string {
  const zh = locale === 'zh'
  const title = zh ? '授权请求无效 — Kindred' : 'Invalid Authorization Request — Kindred'
  const bodyHtml = `
    <h1>${escapeHtml(heading)}</h1>
    <p class="sub">${escapeHtml(detail)}</p>
    <div class="foot">${zh ? '请回到你的 AI 对话重新发起连接。' : 'Return to your AI chat and start the connection again.'}</div>
  `
  return renderOAuthPageShell(locale, title, bodyHtml)
}

function buildRedirectResponse(
  redirectUri: string,
  origin: string,
  params: Record<string, string | null | undefined>,
): Response {
  const target = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') {
      target.searchParams.set(k, v)
    }
  }
  target.searchParams.set('iss', origin.replace(/\/+$/, ''))
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

function oauthJsonError(
  c: Context<{ Bindings: Env }>,
  status: 400 | 401,
  error: string,
  errorDescription: string,
  extraHeaders?: Record<string, string>,
) {
  c.header('Cache-Control', 'no-store')
  c.header('Pragma', 'no-cache')
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      c.header(k, v)
    }
  }
  return c.json({ error, error_description: errorDescription }, status)
}

function decodeFormComponent(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, '%20'))
  } catch {
    return raw
  }
}

async function parseTokenRequestBody(
  c: Context<{ Bindings: Env }>,
  maxBytes = INBOUND_TOKEN_MAX_BYTES,
): Promise<Record<string, string> | null> {
  const contentType = (c.req.header('Content-Type') ?? '').toLowerCase()
  const rawText = await readBoundedText(c.req.raw.body, c.req.header('Content-Length'), maxBytes)
  if (rawText === null) return null

  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(rawText) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v
      }
      return out
    } catch {
      return null
    }
  }

  const params = new URLSearchParams(rawText)
  const out: Record<string, string> = {}
  for (const [k, v] of params.entries()) {
    out[k] = v
  }
  return out
}

function parseBasicCredentials(authHeader: string | undefined): { clientId: string; clientSecret: string } | null {
  if (!authHeader || !/^Basic\s+/i.test(authHeader)) return null
  const encoded = authHeader.replace(/^Basic\s+/i, '').trim()
  let decoded: string
  try {
    decoded = atob(encoded)
  } catch {
    return null
  }
  const colonIdx = decoded.indexOf(':')
  if (colonIdx === -1) return null
  return {
    clientId: decodeFormComponent(decoded.slice(0, colonIdx)),
    clientSecret: decodeFormComponent(decoded.slice(colonIdx + 1)),
  }
}

async function authenticateClient(
  c: Context<{ Bindings: Env }>,
  origin: string,
  body: Record<string, string>,
): Promise<
  | { ok: true; clientId: string; registeredClient: OAuthClientRecord | null }
  | { ok: false; response: Response }
> {
  const basicCreds = parseBasicCredentials(c.req.header('Authorization'))
  if (c.req.header('Authorization') && !basicCreds) {
    return {
      ok: false,
      response: oauthJsonError(c, 401, 'invalid_client', 'Malformed Authorization header', {
        'WWW-Authenticate': 'Basic realm="kindred"',
      }),
    }
  }
  if (basicCreds && body.client_secret) {
    return {
      ok: false,
      response: oauthJsonError(c, 400, 'invalid_request', 'Multiple client authentication methods provided'),
    }
  }
  if (basicCreds && body.client_id && body.client_id !== basicCreds.clientId) {
    return {
      ok: false,
      response: oauthJsonError(c, 400, 'invalid_request', 'Conflicting client_id values'),
    }
  }

  const clientId = (basicCreds?.clientId ?? body.client_id ?? '').trim()
  const clientSecret = basicCreds?.clientSecret ?? body.client_secret ?? null
  if (!clientId) {
    return { ok: false, response: oauthJsonError(c, 400, 'invalid_request', 'Missing client_id') }
  }

  const registeredClient = await resolveOAuthClient(c.env.DB, origin, clientId, false)
  if (registeredClient) {
    if (registeredClient.tokenEndpointAuthMethod === 'none') {
      if (clientSecret) {
        return {
          ok: false,
          response: oauthJsonError(c, 401, 'invalid_client', 'Unexpected client_secret for public client'),
        }
      }
      return { ok: true, clientId, registeredClient }
    }
    const expectedBasic = registeredClient.tokenEndpointAuthMethod === 'client_secret_basic'
    if (expectedBasic && !basicCreds) {
      return {
        ok: false,
        response: oauthJsonError(c, 401, 'invalid_client', 'Client must authenticate using HTTP Basic', {
          'WWW-Authenticate': 'Basic realm="kindred"',
        }),
      }
    }
    if (!expectedBasic && basicCreds) {
      return {
        ok: false,
        response: oauthJsonError(c, 401, 'invalid_client', 'Client must authenticate using client_secret_post'),
      }
    }
    if (
      !clientSecret ||
      !registeredClient.clientSecretHash ||
      !timingSafeEqual(await sha256Hex(clientSecret), registeredClient.clientSecretHash)
    ) {
      return {
        ok: false,
        response: oauthJsonError(
          c,
          401,
          'invalid_client',
          'Invalid client credentials',
          basicCreds ? { 'WWW-Authenticate': 'Basic realm="kindred"' } : undefined,
        ),
      }
    }
    return { ok: true, clientId, registeredClient }
  }

  if (!isCimdClientId(origin, clientId) || clientSecret) {
    return {
      ok: false,
      response: oauthJsonError(c, 401, 'invalid_client', 'Unknown or unauthenticated client'),
    }
  }

  return { ok: true, clientId, registeredClient: null }
}

function parseRequestedScope(rawScope: string | null): { ok: true; scope: string } | { ok: false } {
  const trimmed = (rawScope ?? '').trim()
  if (!trimmed) return { ok: true, scope: DEFAULT_SCOPE }
  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || tokens.length > 8) return { ok: false }
  for (const t of tokens) {
    if (!SUPPORTED_SCOPES.has(t)) return { ok: false }
  }
  return { ok: true, scope: Array.from(new Set(tokens)).join(' ') }
}

async function pruneExpiredAuthRequests(db: D1Database, nowIso: string) {
  const reqCutoffIso = new Date(Date.parse(nowIso) - 60 * 60 * 1000).toISOString()
  const codeCutoffIso = new Date(Date.parse(nowIso) - 24 * 60 * 60 * 1000).toISOString()
  await db.batch([
    db
      .prepare('DELETE FROM oauth_auth_requests WHERE id IN (SELECT id FROM oauth_auth_requests WHERE expires_at < ? LIMIT 50)')
      .bind(reqCutoffIso),
    db
      .prepare(
        'DELETE FROM oauth_codes WHERE code_hash IN (SELECT code_hash FROM oauth_codes WHERE expires_at < ? AND used_at IS NULL LIMIT 50)',
      )
      .bind(codeCutoffIso),
  ])
}

export function createOAuthRoutes() {
  const app = new Hono<{ Bindings: Env }>({ strict: false })

  app.post('/register', async (c) => {
    const rawText = await readBoundedText(c.req.raw.body, c.req.header('Content-Length'), INBOUND_SMALL_MAX_BYTES)
    if (rawText === null) {
      return oauthJsonError(c, 400, 'invalid_client_metadata', 'Registration payload too large')
    }
    let body: Record<string, unknown>
    try {
      const parsed = JSON.parse(rawText) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return oauthJsonError(c, 400, 'invalid_client_metadata', 'Request body must be a JSON object')
      }
      body = parsed as Record<string, unknown>
    } catch {
      return oauthJsonError(c, 400, 'invalid_client_metadata', 'Invalid JSON body')
    }

    if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length < 1 || body.redirect_uris.length > 10) {
      return oauthJsonError(c, 400, 'invalid_redirect_uri', 'redirect_uris must be an array of 1 to 10 valid URIs')
    }
    const redirectUris: string[] = []
    for (const uri of body.redirect_uris) {
      if (typeof uri !== 'string' || !isValidRedirectUri(uri)) {
        return oauthJsonError(
          c,
          400,
          'invalid_redirect_uri',
          'Each redirect_uri must be a valid https URI or loopback http URI without fragments',
        )
      }
      redirectUris.push(uri)
    }

    const authMethodRaw = body.token_endpoint_auth_method ?? 'client_secret_basic'
    if (typeof authMethodRaw !== 'string' || !SUPPORTED_AUTH_METHODS.has(authMethodRaw)) {
      return oauthJsonError(
        c,
        400,
        'invalid_client_metadata',
        'token_endpoint_auth_method must be none, client_secret_post, or client_secret_basic',
      )
    }
    const authMethod = authMethodRaw as 'none' | 'client_secret_post' | 'client_secret_basic'

    const grantTypesRaw = body.grant_types ?? ['authorization_code']
    if (
      !Array.isArray(grantTypesRaw) ||
      grantTypesRaw.length < 1 ||
      !grantTypesRaw.every((g) => g === 'authorization_code' || g === 'refresh_token') ||
      !grantTypesRaw.includes('authorization_code')
    ) {
      return oauthJsonError(c, 400, 'invalid_client_metadata', 'grant_types must include authorization_code')
    }
    const grantTypes = Array.from(new Set(grantTypesRaw as string[]))

    const responseTypesRaw = body.response_types ?? ['code']
    if (!Array.isArray(responseTypesRaw) || responseTypesRaw.length !== 1 || responseTypesRaw[0] !== 'code') {
      return oauthJsonError(c, 400, 'invalid_client_metadata', 'response_types must be ["code"]')
    }

    const rawName = typeof body.client_name === 'string' ? body.client_name.trim() : ''
    const defaultName = new URL(redirectUris[0]!).hostname
    const clientName = (rawName || defaultName).slice(0, 120)

    const clientId = randomToken('kndc_id_', 16)
    const rawSecret = authMethod === 'none' ? null : randomToken('kndcs_', 24)
    const secretHash = rawSecret ? await sha256Hex(rawSecret) : null
    const now = new Date().toISOString()

    await c.env.DB.prepare(
      `INSERT INTO oauth_clients (
         client_id, client_name, redirect_uris_json, token_endpoint_auth_method,
         client_secret_hash, grant_types_json, response_types_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        clientId,
        clientName,
        JSON.stringify(redirectUris),
        authMethod,
        secretHash,
        JSON.stringify(grantTypes),
        JSON.stringify(['code']),
        now,
      )
      .run()

    c.header('Cache-Control', 'no-store')
    c.header('Pragma', 'no-cache')
    const responseBody: Record<string, unknown> = {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: ['code'],
      token_endpoint_auth_method: authMethod,
    }
    if (rawSecret) {
      responseBody.client_secret = rawSecret
      responseBody.client_secret_expires_at = 0
    }
    return c.json(responseBody, 201)
  })

  app.get('/authorize', async (c) => {
    const url = new URL(c.req.url)
    const origin = url.origin
    const locale = detectConsentLocale(c)
    const clientId = (url.searchParams.get('client_id') ?? '').trim()
    const rawRedirectUri = (url.searchParams.get('redirect_uri') ?? '').trim()

    if (!clientId) {
      return new Response(
        renderOAuthErrorHtml(
          locale,
          locale === 'zh' ? '缺少客户端信息' : 'Missing client_id',
          locale === 'zh' ? '授权请求缺少 client_id，无法继续。' : 'The authorization request is missing client_id.',
        ),
        { status: 400, headers: buildSecurityHeaders() },
      )
    }

    const client = await resolveOAuthClient(c.env.DB, origin, clientId, true)
    if (!client) {
      return new Response(
        renderOAuthErrorHtml(
          locale,
          locale === 'zh' ? '未识别的客户端' : 'Unknown OAuth client',
          locale === 'zh'
            ? '找不到该 client_id 的注册记录或元数据文档。'
            : 'Could not verify this client_id via dynamic registration or client metadata document.',
        ),
        { status: 400, headers: buildSecurityHeaders() },
      )
    }

    let redirectUri = rawRedirectUri
    const redirectUriSent = rawRedirectUri ? 1 : 0
    if (!redirectUri) {
      if (client.redirectUris.length === 1) {
        redirectUri = client.redirectUris[0]!
      } else {
        return new Response(
          renderOAuthErrorHtml(
            locale,
            locale === 'zh' ? '缺少回调地址' : 'Missing redirect_uri',
            locale === 'zh'
              ? '该客户端登记了多个回调地址，请求必须显式指定 redirect_uri。'
              : 'This client has multiple registered redirect URIs and must specify redirect_uri explicitly.',
          ),
          { status: 400, headers: buildSecurityHeaders() },
        )
      }
    }

    if (!isValidRedirectUri(redirectUri) || !client.redirectUris.some((u) => redirectUriMatches(u, redirectUri))) {
      return new Response(
        renderOAuthErrorHtml(
          locale,
          locale === 'zh' ? '回调地址不匹配' : 'Invalid redirect_uri',
          locale === 'zh'
            ? '请求的 redirect_uri 与客户端登记的回调地址不一致，已拒绝重定向。'
            : 'The requested redirect_uri does not match this client’s registered redirect URIs.',
        ),
        { status: 400, headers: buildSecurityHeaders() },
      )
    }

    const state = url.searchParams.get('state')
    const responseType = (url.searchParams.get('response_type') ?? '').trim()
    if (responseType !== 'code') {
      return new Response(
        renderOAuthErrorHtml(
          locale,
          locale === 'zh' ? '不支持的授权类型' : 'Unsupported response_type',
          locale === 'zh' ? 'Kindred 仅支持 response_type=code 授权码流程。' : 'Kindred only supports response_type=code.',
        ),
        { status: 400, headers: buildSecurityHeaders() },
      )
    }

    const codeChallenge = (url.searchParams.get('code_challenge') ?? '').trim()
    const codeChallengeMethod = (url.searchParams.get('code_challenge_method') ?? '').trim()
    if (!PKCE_CHALLENGE_RE.test(codeChallenge) || codeChallengeMethod !== 'S256') {
      return new Response(
        renderOAuthErrorHtml(
          locale,
          locale === 'zh' ? '缺少 PKCE S256 校验参数' : 'PKCE S256 required',
          locale === 'zh'
            ? '请求必须提供有效的 code_challenge 与 code_challenge_method=S256。'
            : 'Requests must include a valid PKCE code_challenge with code_challenge_method=S256.',
        ),
        { status: 400, headers: buildSecurityHeaders() },
      )
    }

    const scopeRes = parseRequestedScope(url.searchParams.get('scope'))
    if (!scopeRes.ok) {
      return new Response(
        renderOAuthErrorHtml(
          locale,
          locale === 'zh' ? '不支持的权限范围' : 'Invalid scope',
          locale === 'zh' ? 'Kindred 仅支持 kindred 权限范围。' : 'Only the kindred scope is supported.',
        ),
        { status: 400, headers: buildSecurityHeaders() },
      )
    }

    const rawResource = url.searchParams.get('resource')
    let boundResource = `${origin.replace(/\/+$/, '')}/mcp`
    if (rawResource && rawResource.trim()) {
      const canonical = canonicalizeResource(origin, rawResource)
      if (!canonical) {
        return new Response(
          renderOAuthErrorHtml(
            locale,
            locale === 'zh' ? '资源目标不匹配' : 'Invalid resource indicator',
            locale === 'zh'
              ? `resource 参数必须指向 ${origin.replace(/\/+$/, '')}/mcp。`
              : `The resource parameter must target ${origin.replace(/\/+$/, '')}/mcp.`,
          ),
          { status: 400, headers: buildSecurityHeaders() },
        )
      }
      boundResource = canonical
    }

    const allowRefresh = client.grantTypes.includes('refresh_token') ? 1 : 0
    const nowMs = Date.now()
    const nowIso = new Date(nowMs).toISOString()
    const expiresIso = new Date(nowMs + AUTH_REQUEST_TTL_MS).toISOString()
    const requestId = randomToken('oar_', 16)
    const csrfToken = randomToken('csrf_', 24)
    const csrfTokenHash = await sha256Hex(csrfToken)

    await pruneExpiredAuthRequests(c.env.DB, nowIso)
    await c.env.DB.prepare(
      `INSERT INTO oauth_auth_requests (
         id, client_id, client_name, redirect_uri, redirect_uri_sent, allow_refresh,
         code_challenge, scope, state, resource, csrf_token_hash, expires_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        requestId,
        client.clientId,
        client.clientName,
        redirectUri,
        redirectUriSent,
        allowRefresh,
        codeChallenge,
        scopeRes.scope,
        state ?? null,
        boundResource,
        csrfTokenHash,
        expiresIso,
        nowIso,
      )
      .run()

    const secureFlag = url.protocol === 'https:' ? '; Secure' : ''
    const cookieValue = `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; HttpOnly${secureFlag}; SameSite=Lax; Path=/oauth/authorize; Max-Age=600`
    const parsedRedirect = new URL(redirectUri)
    const toggleHref = buildToggleLocaleHref(c.req.url, locale === 'zh' ? 'en' : 'zh')

    return new Response(
      renderConsentHtml({
        locale,
        clientName: client.clientName,
        redirectHost: parsedRedirect.host,
        requestId,
        csrfToken,
        toggleHref,
      }),
      {
        status: 200,
        headers: buildSecurityHeaders({
          formActionOrigin: parsedRedirect.origin,
          extra: { 'Set-Cookie': cookieValue },
        }),
      },
    )
  })

  app.post('/authorize', async (c) => {
    const url = new URL(c.req.url)
    const origin = url.origin
    const locale = detectConsentLocale(c)
    const rawText = await readBoundedText(c.req.raw.body, c.req.header('Content-Length'), INBOUND_SMALL_MAX_BYTES)
    if (rawText === null) {
      return new Response(
        renderOAuthErrorHtml(
          locale,
          locale === 'zh' ? '请求体过大' : 'Request too large',
          locale === 'zh' ? '请返回 AI 对话重新开始授权。' : 'Return to your AI chat and try again.',
        ),
        { status: 400, headers: buildSecurityHeaders() },
      )
    }

    const form = new URLSearchParams(rawText)
    const requestId = (form.get('request_id') ?? '').trim()
    const formCsrf = (form.get('csrf_token') ?? '').trim()
    const decision = (form.get('decision') ?? '').trim()
    const cookieCsrf = parseCookie(c.req.header('Cookie'), CSRF_COOKIE_NAME) ?? ''

    if (!requestId || !formCsrf || !cookieCsrf || !timingSafeEqual(formCsrf, cookieCsrf)) {
      return new Response(
        renderOAuthErrorHtml(
          locale,
          locale === 'zh' ? '授权会话已过期或校验失败' : 'Authorization session expired',
          locale === 'zh'
            ? '出于安全校验，本次表单未能通过验证，请回到 AI 对话重新打开授权链接。'
            : 'For security, this authorization form could not be verified. Please reopen the link from your AI chat.',
        ),
        { status: 400, headers: buildSecurityHeaders() },
      )
    }

    const authReq = await c.env.DB.prepare('SELECT * FROM oauth_auth_requests WHERE id = ?')
      .bind(requestId)
      .first<OAuthAuthRequestRow>()
    const nowIso = new Date().toISOString()
    if (!authReq || authReq.used_at !== null || authReq.expires_at <= nowIso) {
      return new Response(
        renderOAuthErrorHtml(
          locale,
          locale === 'zh' ? '授权链接已失效' : 'Authorization request expired',
          locale === 'zh'
            ? '这个授权页面只能使用一次，请回到 AI 对话重新发起连接。'
            : 'This authorization link is single-use or expired. Please start again from your AI chat.',
        ),
        { status: 400, headers: buildSecurityHeaders() },
      )
    }

    const csrfHash = await sha256Hex(formCsrf)
    if (!timingSafeEqual(csrfHash, authReq.csrf_token_hash)) {
      return new Response(
        renderOAuthErrorHtml(
          locale,
          locale === 'zh' ? '授权校验失败' : 'Invalid CSRF token',
          locale === 'zh' ? '请回到 AI 对话重新打开授权链接。' : 'Please reopen the authorization link from your AI chat.',
        ),
        { status: 400, headers: buildSecurityHeaders() },
      )
    }

    const consumeRes = await c.env.DB.prepare(
      `UPDATE oauth_auth_requests
       SET used_at = ?
       WHERE id = ? AND used_at IS NULL AND expires_at > ?`,
    )
      .bind(nowIso, authReq.id, nowIso)
      .run()
    if (Number(consumeRes.meta?.changes ?? 0) !== 1) {
      return new Response(
        renderOAuthErrorHtml(
          locale,
          locale === 'zh' ? '授权已处理' : 'Authorization already used',
          locale === 'zh' ? '请回到 AI 对话查看连接结果。' : 'Return to your AI chat to see the connection status.',
        ),
        { status: 400, headers: buildSecurityHeaders() },
      )
    }

    if (decision !== 'approve') {
      return buildRedirectResponse(authReq.redirect_uri, origin, {
        error: 'access_denied',
        error_description: 'The user declined the anonymous connection request',
        state: authReq.state,
      })
    }

    const rawCode = randomToken('kndc_', 24)
    const codeHash = await sha256Hex(rawCode)
    const codeExpiresIso = new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString()

    await c.env.DB.prepare(
      `INSERT INTO oauth_codes (
         code_hash, client_id, redirect_uri, redirect_uri_sent, allow_refresh,
         code_challenge, scope, resource, expires_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        codeHash,
        authReq.client_id,
        authReq.redirect_uri,
        authReq.redirect_uri_sent,
        authReq.allow_refresh,
        authReq.code_challenge,
        authReq.scope,
        authReq.resource,
        codeExpiresIso,
        nowIso,
      )
      .run()

    return buildRedirectResponse(authReq.redirect_uri, origin, {
      code: rawCode,
      state: authReq.state,
    })
  })

  app.post('/token', async (c) => {
    const origin = new URL(c.req.url).origin
    const body = await parseTokenRequestBody(c, INBOUND_TOKEN_MAX_BYTES)
    if (!body) {
      return oauthJsonError(c, 400, 'invalid_request', 'Invalid or oversized token request payload')
    }

    const clientAuth = await authenticateClient(c, origin, body)
    if (!clientAuth.ok) return clientAuth.response
    const { clientId, registeredClient } = clientAuth

    const grantType = (body.grant_type ?? '').trim()
    const nowMs = Date.now()
    const nowIso = new Date(nowMs).toISOString()

    if (grantType === 'authorization_code') {
      if (registeredClient && !registeredClient.grantTypes.includes('authorization_code')) {
        return oauthJsonError(c, 400, 'unauthorized_client', 'Client is not authorized for authorization_code grant')
      }
      const code = (body.code ?? '').trim()
      const redirectUri = (body.redirect_uri ?? '').trim()
      const codeVerifier = (body.code_verifier ?? '').trim()
      if (!code || !PKCE_VERIFIER_RE.test(codeVerifier)) {
        return oauthJsonError(c, 400, 'invalid_request', 'Missing or invalid code or code_verifier')
      }

      const codeHash = await sha256Hex(code)
      const codeRow = await c.env.DB.prepare('SELECT * FROM oauth_codes WHERE code_hash = ?')
        .bind(codeHash)
        .first<OAuthCodeRow>()
      if (!codeRow) {
        return oauthJsonError(c, 400, 'invalid_grant', 'Invalid authorization code')
      }

      if (codeRow.client_id !== clientId) {
        return oauthJsonError(c, 400, 'invalid_grant', 'Authorization code client mismatch')
      }
      if (redirectUri && codeRow.redirect_uri !== redirectUri) {
        return oauthJsonError(c, 400, 'invalid_grant', 'Authorization code redirect_uri mismatch')
      }
      const computedChallenge = await sha256Base64Url(codeVerifier)
      if (!timingSafeEqual(computedChallenge, codeRow.code_challenge)) {
        return oauthJsonError(c, 400, 'invalid_grant', 'PKCE code_verifier verification failed')
      }

      if (codeRow.used_at !== null) {
        const revokeId = randomToken('rev_', 12)
        await c.env.DB.prepare(
          'UPDATE oauth_tokens SET revoked_at = ?, revoked_by = ? WHERE auth_code_hash = ? AND revoked_at IS NULL',
        )
          .bind(nowIso, revokeId, codeHash)
          .run()
        return oauthJsonError(c, 400, 'invalid_grant', 'Authorization code already used')
      }

      if (codeRow.expires_at <= nowIso) {
        return oauthJsonError(c, 400, 'invalid_grant', 'Authorization code expired')
      }

      const boundResource = codeRow.resource ?? `${origin.replace(/\/+$/, '')}/mcp`
      if (body.resource && body.resource.trim()) {
        const canonical = canonicalizeResource(origin, body.resource)
        if (!canonical || canonical !== boundResource) {
          return oauthJsonError(c, 400, 'invalid_target', 'Resource mismatch')
        }
      }

      const issueRefresh = codeRow.allow_refresh === 1 && (!registeredClient || registeredClient.grantTypes.includes('refresh_token'))
      const consumeId = randomToken('use_', 12)
      const agentId = randomToken('agt_', 12)
      const tokenId = randomToken('tok_', 12)
      const accessToken = randomToken('knd_', 24)
      const refreshToken = issueRefresh ? randomToken('kndr_', 24) : null
      const accessTokenHash = await sha256Hex(accessToken)
      const refreshTokenHash = refreshToken ? await sha256Hex(refreshToken) : null
      const agentPlaceholderHash = `oauth_${agentId}`
      const accessExpiresIso = new Date(nowMs + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString()
      const refreshExpiresIso = refreshToken ? new Date(nowMs + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString() : null

      const results = await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE oauth_codes
           SET used_at = ?, consumed_by = ?
           WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?`,
        ).bind(nowIso, consumeId, codeHash, nowIso),
        c.env.DB.prepare(
          `INSERT INTO agents (
             id, token_hash, quiz_ready, current_quiz_version, skill_version, created_at, last_seen_at
           )
           SELECT ?, ?, 0, 0, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM oauth_codes WHERE code_hash = ? AND consumed_by = ?)`,
        ).bind(agentId, agentPlaceholderHash, CURRENT_SKILL_VERSION, nowIso, nowIso, codeHash, consumeId),
        c.env.DB.prepare(
          `INSERT INTO oauth_tokens (
             id, agent_id, client_id, access_token_hash, refresh_token_hash,
             scope, resource, auth_code_hash, expires_at, refresh_expires_at, created_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM agents WHERE id = ?)`,
        ).bind(
          tokenId,
          agentId,
          clientId,
          accessTokenHash,
          refreshTokenHash,
          codeRow.scope,
          boundResource,
          codeHash,
          accessExpiresIso,
          refreshExpiresIso,
          nowIso,
          agentId,
        ),
      ])

      if (Number(results[0]?.meta?.changes ?? 0) !== 1 || Number(results[2]?.meta?.changes ?? 0) !== 1) {
        const revokeId = randomToken('rev_', 12)
        await c.env.DB.prepare(
          'UPDATE oauth_tokens SET revoked_at = ?, revoked_by = ? WHERE auth_code_hash = ? AND revoked_at IS NULL',
        )
          .bind(nowIso, revokeId, codeHash)
          .run()
        return oauthJsonError(c, 400, 'invalid_grant', 'Authorization code already used')
      }

      c.header('Cache-Control', 'no-store')
      c.header('Pragma', 'no-cache')
      const responsePayload: Record<string, unknown> = {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        scope: codeRow.scope,
      }
      if (refreshToken) {
        responsePayload.refresh_token = refreshToken
      }
      return c.json(responsePayload)
    }

    if (grantType === 'refresh_token') {
      if (registeredClient && !registeredClient.grantTypes.includes('refresh_token')) {
        return oauthJsonError(c, 400, 'unauthorized_client', 'Client is not authorized for refresh_token grant')
      }
      const refreshToken = (body.refresh_token ?? '').trim()
      if (!refreshToken) {
        return oauthJsonError(c, 400, 'invalid_request', 'Missing refresh_token')
      }

      const refreshHash = await sha256Hex(refreshToken)
      const tokenRow = await c.env.DB.prepare('SELECT * FROM oauth_tokens WHERE refresh_token_hash = ?')
        .bind(refreshHash)
        .first<OAuthTokenRow>()
      if (!tokenRow) {
        return oauthJsonError(c, 400, 'invalid_grant', 'Invalid refresh_token')
      }

      if (tokenRow.client_id !== clientId) {
        return oauthJsonError(c, 400, 'invalid_grant', 'Refresh token client mismatch')
      }
      if (!tokenRow.refresh_expires_at || tokenRow.refresh_expires_at <= nowIso) {
        return oauthJsonError(c, 400, 'invalid_grant', 'Refresh token expired')
      }
      if (body.resource && body.resource.trim()) {
        const canonical = canonicalizeResource(origin, body.resource)
        if (!canonical || canonical !== tokenRow.resource) {
          return oauthJsonError(c, 400, 'invalid_target', 'Resource mismatch')
        }
      }

      if (tokenRow.revoked_at !== null) {
        const revokeId = randomToken('rev_', 12)
        await c.env.DB.prepare(
          'UPDATE oauth_tokens SET revoked_at = ?, revoked_by = ? WHERE agent_id = ? AND client_id = ? AND revoked_at IS NULL',
        )
          .bind(nowIso, revokeId, tokenRow.agent_id, tokenRow.client_id)
          .run()
        return oauthJsonError(c, 400, 'invalid_grant', 'Refresh token was already used or revoked')
      }

      const rotateId = randomToken('rot_', 12)
      const newTokenId = randomToken('tok_', 12)
      const newAccessToken = randomToken('knd_', 24)
      const newRefreshToken = randomToken('kndr_', 24)
      const newAccessHash = await sha256Hex(newAccessToken)
      const newRefreshHash = await sha256Hex(newRefreshToken)
      const accessExpiresIso = new Date(nowMs + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString()
      const refreshExpiresIso = new Date(nowMs + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString()

      const results = await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE oauth_tokens
           SET revoked_at = ?, revoked_by = ?
           WHERE id = ? AND revoked_at IS NULL AND refresh_expires_at > ?`,
        ).bind(nowIso, rotateId, tokenRow.id, nowIso),
        c.env.DB.prepare(
          `INSERT INTO oauth_tokens (
             id, agent_id, client_id, access_token_hash, refresh_token_hash,
             scope, resource, auth_code_hash, expires_at, refresh_expires_at, created_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM oauth_tokens WHERE id = ? AND revoked_by = ?)
             AND EXISTS (SELECT 1 FROM agents WHERE id = ?)`,
        ).bind(
          newTokenId,
          tokenRow.agent_id,
          tokenRow.client_id,
          newAccessHash,
          newRefreshHash,
          tokenRow.scope,
          tokenRow.resource,
          tokenRow.auth_code_hash,
          accessExpiresIso,
          refreshExpiresIso,
          nowIso,
          tokenRow.id,
          rotateId,
          tokenRow.agent_id,
        ),
      ])

      if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
        const revokeId = randomToken('rev_', 12)
        await c.env.DB.prepare(
          'UPDATE oauth_tokens SET revoked_at = ?, revoked_by = ? WHERE agent_id = ? AND client_id = ? AND revoked_at IS NULL',
        )
          .bind(nowIso, revokeId, tokenRow.agent_id, tokenRow.client_id)
          .run()
        return oauthJsonError(c, 400, 'invalid_grant', 'Concurrent refresh token replay detected')
      }

      if (Number(results[1]?.meta?.changes ?? 0) !== 1) {
        return oauthJsonError(c, 400, 'invalid_grant', 'Refresh token could not be rotated')
      }

      c.header('Cache-Control', 'no-store')
      c.header('Pragma', 'no-cache')
      return c.json({
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        refresh_token: newRefreshToken,
        scope: tokenRow.scope,
      })
    }

    return oauthJsonError(c, 400, 'unsupported_grant_type', 'Supported grant types are authorization_code and refresh_token')
  })

  app.post('/revoke', async (c) => {
    const origin = new URL(c.req.url).origin
    const body = await parseTokenRequestBody(c, INBOUND_SMALL_MAX_BYTES)
    if (!body) {
      return oauthJsonError(c, 400, 'invalid_request', 'Invalid revocation request payload')
    }
    const token = (body.token ?? '').trim()
    if (!token) {
      return oauthJsonError(c, 400, 'invalid_request', 'Missing token')
    }

    const clientAuth = await authenticateClient(c, origin, body)
    if (!clientAuth.ok) return clientAuth.response

    const hash = await sha256Hex(token)
    const nowIso = new Date().toISOString()
    const revokeId = randomToken('rev_', 12)
    await c.env.DB.prepare(
      `UPDATE oauth_tokens
       SET revoked_at = ?, revoked_by = ?
       WHERE (access_token_hash = ? OR refresh_token_hash = ?)
         AND client_id = ?
         AND revoked_at IS NULL`,
    )
      .bind(nowIso, revokeId, hash, hash, clientAuth.clientId)
      .run()

    c.header('Cache-Control', 'no-store')
    c.header('Pragma', 'no-cache')
    return c.body(null, 200)
  })

  return app
}
