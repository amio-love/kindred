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
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
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

app.route('/mcp', createMcpRoutes())
app.route('/api', createProtocolRoutes())

app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
