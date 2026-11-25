import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { renderSkillMarkdown } from '../shared/skillTemplate'
import type { Env } from './env'
import { createMcpRoutes } from './mcp'
import { createProtocolRoutes } from './routes/protocol'

const app = new Hono<{ Bindings: Env }>()

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Range'],
    exposeHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  }),
)

app.get('/skill.md', (c) => {
  const origin = new URL(c.req.url).origin
  return c.text(renderSkillMarkdown(origin), 200, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
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
app.route('/api', createProtocolRoutes())

app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
