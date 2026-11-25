import { Hono, type Context } from 'hono'
import { extractBearerToken, type Env } from '../env'
import {
  ProtocolError,
  eraseAgent,
  getInbox,
  getPairingReveal,
  guessDrawing,
  pickDrawWord,
  postAnchorNote,
  publishQuiz,
  startDrawGame,
  submitAgentAnswers,
  submitDrawing,
  submitHumanAnswers,
} from '../service'

function resolveToken(c: Context<{ Bindings: Env }>, body?: Record<string, unknown> | null): string | null {
  const fromHeader = extractBearerToken(c.req.header('Authorization'))
  if (fromHeader) return fromHeader
  const fromQuery = new URL(c.req.url).searchParams.get('token')
  if (fromQuery) return fromQuery
  if (body && typeof body.agent_token === 'string' && body.agent_token.trim()) {
    return body.agent_token.trim()
  }
  return null
}

function handleError(c: Context<{ Bindings: Env }>, err: unknown) {
  if (err instanceof ProtocolError) {
    return c.json({ error: err.message, details: err.details }, err.status as 400 | 401 | 403 | 404 | 409)
  }
  const message = err instanceof Error ? err.message : 'Internal error'
  return c.json({ error: message }, 500)
}

export function createProtocolRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  app.post('/quiz', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>().catch(() => null)
      const origin = new URL(c.req.url).origin
      const res = await publishQuiz(c.env.DB, origin, resolveToken(c, body), body?.questions)
      return c.json(res, res.agent_token ? 201 : 200)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.get('/inbox', async (c) => {
    try {
      const origin = new URL(c.req.url).origin
      const res = await getInbox(c.env.DB, origin, resolveToken(c))
      return c.json(res)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.post('/pairings/:id/agent-answers', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>().catch(() => null)
      const res = await submitAgentAnswers(c.env.DB, resolveToken(c, body), c.req.param('id'), body?.answers)
      return c.json(res)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.post('/pairings/:id/human-answers', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>().catch(() => null)
      const origin = new URL(c.req.url).origin
      const res = await submitHumanAnswers(c.env.DB, origin, resolveToken(c, body), c.req.param('id'), body?.answers)
      return c.json(res)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.get('/pairings/:id/reveal', async (c) => {
    try {
      const origin = new URL(c.req.url).origin
      const res = await getPairingReveal(c.env.DB, origin, resolveToken(c), c.req.param('id'))
      return c.json(res)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.post('/pairings/:id/notes', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>().catch(() => null)
      const res = await postAnchorNote(
        c.env.DB,
        resolveToken(c, body),
        c.req.param('id'),
        String(body?.question_id ?? ''),
        String(body?.body ?? ''),
      )
      return c.json(res, 201)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.post('/pairings/:id/draw', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>().catch(() => null)
      const origin = new URL(c.req.url).origin
      const res = await startDrawGame(c.env.DB, origin, resolveToken(c, body), c.req.param('id'))
      return c.json(res, 201)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.post('/draw/:gameId/rounds/:roundId/word', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>().catch(() => null)
      const origin = new URL(c.req.url).origin
      const res = await pickDrawWord(
        c.env.DB,
        origin,
        resolveToken(c, body),
        c.req.param('gameId'),
        c.req.param('roundId'),
        String(body?.word ?? ''),
        body?.surface_decoys,
      )
      return c.json(res)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.post('/draw/:gameId/rounds/:roundId/drawing', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>().catch(() => null)
      const origin = new URL(c.req.url).origin
      const res = await submitDrawing(
        c.env.DB,
        origin,
        resolveToken(c, body),
        c.req.param('gameId'),
        c.req.param('roundId'),
        body?.strokes,
      )
      return c.json(res)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.post('/draw/:gameId/rounds/:roundId/guess', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>().catch(() => null)
      const origin = new URL(c.req.url).origin
      const res = await guessDrawing(
        c.env.DB,
        origin,
        resolveToken(c, body),
        c.req.param('gameId'),
        c.req.param('roundId'),
        typeof body?.guess === 'string' ? body.guess : '',
        Boolean(body?.give_up),
        typeof body?.reaction === 'string' ? body.reaction : undefined,
        body?.choice,
      )
      return c.json(res)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.delete('/agent', async (c) => {
    try {
      const res = await eraseAgent(c.env.DB, resolveToken(c))
      return c.json(res)
    } catch (err) {
      return handleError(c, err)
    }
  })

  return app
}
