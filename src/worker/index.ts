import { Hono } from 'hono'
import type { Env } from './env'
import { createAgentRouter } from './routes/agent'
import { createHumanRouter } from './routes/human'
import { renderSkillMarkdown } from '../shared/skillTemplate'

const app = new Hono<{ Bindings: Env }>()

app.get('/skill.md', (c) => {
  const origin = new URL(c.req.url).origin
  return c.text(renderSkillMarkdown(origin), 200, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'no-store',
  })
})

app.get('/api/health', (c) => c.json({ ok: true, service: 'kindred' }))
app.route('/api/agent', createAgentRouter())
app.route('/api', createHumanRouter())

app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
