import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  KINDRED_SKILL_EXTENSION,
  KINDRED_SKILL_INDEX_URI,
  KINDRED_SKILL_URI,
} from '../shared/skillTemplate'
import type { Env } from './env'
import { createMcpRoutes } from './mcp'
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  createOAuthRoutes,
} from './oauth'

const app = new Hono<{ Bindings: Env }>({ strict: false })

const DISCOVERY_LINK_HEADER =
  '</.well-known/mcp.json>; rel="describedby"; type="application/json", </.well-known/oauth-protected-resource>; rel="oauth-protected-resource"; type="application/json"'

const publicCors = cors({
  origin: '*',
  allowMethods: ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Mcp-Session-Id',
    'Mcp-Protocol-Version',
    'Last-Event-ID',
    'Range',
  ],
  exposeHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Mcp-Session-Id', 'WWW-Authenticate'],
})

app.use('/mcp', publicCors)
app.use('/mcp/*', publicCors)
app.use('/.well-known/*', publicCors)
app.use('/oauth/register', publicCors)
app.use('/oauth/token', publicCors)
app.use('/oauth/revoke', publicCors)
app.use('/img/*', publicCors)
app.use('/media/*', publicCors)

function buildWellKnownJsonResponse(isHead: boolean, payload: unknown): Response {
  return new Response(isHead ? null : JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

app.on(['GET', 'HEAD'], '/.well-known/oauth-protected-resource', (c) => {
  const origin = new URL(c.req.url).origin
  return buildWellKnownJsonResponse(c.req.method === 'HEAD', buildProtectedResourceMetadata(origin))
})

app.on(['GET', 'HEAD'], '/.well-known/oauth-protected-resource/mcp', (c) => {
  const origin = new URL(c.req.url).origin
  return buildWellKnownJsonResponse(c.req.method === 'HEAD', buildProtectedResourceMetadata(origin))
})

app.on(['GET', 'HEAD'], '/.well-known/oauth-authorization-server', (c) => {
  const origin = new URL(c.req.url).origin
  return buildWellKnownJsonResponse(c.req.method === 'HEAD', buildAuthorizationServerMetadata(origin))
})

app.on(['GET', 'HEAD'], '/.well-known/mcp.json', (c) => {
  const origin = new URL(c.req.url).origin
  const manifest = {
    schema_version: '1.0',
    name: 'kindred',
    title: 'Kindred',
    description:
      'Open personal-agent matching protocol — blind ultra-short quizzes, silent agent screening, and blind visual subtext games inside your own AI chat.',
    protocol_version: '2025-03-26',
    endpoint: `${origin}/mcp`,
    homepage: origin,
    transport: 'streamable-http',
    transports: ['streamable-http'],
    auth: {
      type: 'oauth2',
      mode: 'anonymous-one-click',
      protected_resource_metadata: `${origin}/.well-known/oauth-protected-resource`,
      authorization_server_metadata: `${origin}/.well-known/oauth-authorization-server`,
      scopes: ['kindred'],
    },
    capabilities: {
      tools: true,
      resources: true,
      prompts: true,
      extensions: [KINDRED_SKILL_EXTENSION],
    },
    skills: {
      index: KINDRED_SKILL_INDEX_URI,
      entry: KINDRED_SKILL_URI,
    },
  }
  return buildWellKnownJsonResponse(c.req.method === 'HEAD', manifest)
})

app.on(['GET', 'HEAD'], '/', async (c) => {
  const isHead = c.req.method === 'HEAD'
  const assetUrl = new URL('/index.html', c.req.url)
  const assetRes = await c.env.ASSETS.fetch(new Request(assetUrl.toString(), { method: 'GET' }))
  if (!assetRes.ok) return assetRes
  const rawHtml = await assetRes.text()
  return new Response(isHead ? null : rawHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      Link: DISCOVERY_LINK_HEADER,
    },
  })
})

app.get('/img/:file', async (c) => {
  const file = c.req.param('file')
  if (!file.endsWith('.svg')) return c.notFound()
  const roundId = file.slice(0, -4)
  const row = await c.env.DB.prepare('SELECT svg_markup FROM draw_rounds WHERE id = ?')
    .bind(roundId)
    .first<{ svg_markup: string | null }>()
  if (!row?.svg_markup) return c.notFound()

  return new Response(row.svg_markup, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'no-store',
    },
  })
})

app.on(['GET', 'HEAD'], '/media/*', async (c) => {
  const assetReq = new Request(c.req.url, { method: 'GET' })
  const assetRes = await c.env.ASSETS.fetch(assetReq)
  const contentType = assetRes.headers.get('Content-Type') ?? 'application/octet-stream'
  if (!assetRes.ok || contentType.startsWith('text/html')) return c.notFound()
  const buf = await assetRes.arrayBuffer()
  const total = buf.byteLength
  const baseHeaders = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
  }

  const rangeHeader = c.req.header('Range')
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
    if (!match) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}` },
      })
    }
    const rawStart = match[1]
    const rawEnd = match[2]
    let start: number
    let end: number
    if (rawStart === '' && rawEnd !== '') {
      const suffix = Number(rawEnd)
      start = Math.max(0, total - suffix)
      end = total - 1
    } else {
      start = Number(rawStart)
      end = rawEnd === '' ? total - 1 : Math.min(total - 1, Number(rawEnd))
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}` },
      })
    }
    const slice = buf.slice(start, end + 1)
    return new Response(c.req.method === 'HEAD' ? null : slice, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': String(slice.byteLength),
      },
    })
  }

  return new Response(c.req.method === 'HEAD' ? null : buf, {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Length': String(total),
    },
  })
})

app.route('/mcp', createMcpRoutes())
app.route('/oauth', createOAuthRoutes())

app.all('/mcp/*', (c) => c.notFound())
app.all('/oauth/*', (c) => c.notFound())
app.all('/.well-known/*', (c) => c.notFound())
app.all('/api', (c) => c.notFound())
app.all('/api/*', (c) => c.notFound())
app.all('/skill.md', (c) => c.notFound())
app.all('/skill.md/*', (c) => c.notFound())
app.all('/llms.txt', (c) => c.notFound())

app.all('*', async (c) => {
  const pathname = new URL(c.req.url).pathname
  if (pathname.startsWith('/skill.md')) {
    return c.notFound()
  }
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
