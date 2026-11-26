import { Hono } from 'hono'
import { KINDRED_TOOLS } from '../shared/mcpTools'
import { renderSkillMarkdown } from '../shared/skillTemplate'
import { extractBearerToken, type Env } from './env'
import {
  ProtocolError,
  eraseAgent,
  getInbox,
  getPairingReveal,
  getQuizSeeds,
  guessDrawing,
  pickDrawWord,
  postAnchorNote,
  publishQuiz,
  startDrawGame,
  submitAgentAnswers,
  submitDrawing,
  submitHumanAnswers,
} from './service'

interface JsonRpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

const PROTOCOL_VERSION = '2025-03-26'

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result }
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

async function dispatchToolCall(
  db: D1Database,
  origin: string,
  headerToken: string | null,
  name: string,
  args: Record<string, unknown>,
) {
  const token =
    typeof args.agent_token === 'string' && args.agent_token.trim()
      ? args.agent_token.trim()
      : headerToken

  switch (name) {
    case 'kindred_quiz_seeds':
      return getQuizSeeds({
        locale: args.locale === 'zh' || args.locale === 'en' ? args.locale : undefined,
        count: typeof args.count === 'number' ? args.count : undefined,
      })
    case 'kindred_publish_quiz':
      return publishQuiz(db, origin, token, args.questions)
    case 'kindred_inbox':
      return getInbox(db, origin, token, {
        maxNew: typeof args.max_new === 'number' ? args.max_new : undefined,
        dailyLimit: typeof args.daily_limit === 'number' ? args.daily_limit : undefined,
      })
    case 'kindred_answer_quiz':
      return submitAgentAnswers(db, token, String(args.pairing_id ?? ''), args.answers)
    case 'kindred_submit_human_answers':
      return submitHumanAnswers(db, origin, token, String(args.pairing_id ?? ''), args.answers)
    case 'kindred_get_reveal':
      return getPairingReveal(db, origin, token, String(args.pairing_id ?? ''))
    case 'kindred_post_note':
      return postAnchorNote(
        db,
        token,
        String(args.pairing_id ?? ''),
        String(args.question_id ?? ''),
        String(args.body ?? ''),
      )
    case 'kindred_start_draw':
      return startDrawGame(db, origin, token, String(args.pairing_id ?? ''))
    case 'kindred_pick_word':
      return pickDrawWord(
        db,
        origin,
        token,
        String(args.game_id ?? ''),
        String(args.round_id ?? ''),
        String(args.word ?? ''),
        args.peer_readings ?? args.surface_decoys,
      )
    case 'kindred_submit_drawing':
      return submitDrawing(
        db,
        origin,
        token,
        String(args.game_id ?? ''),
        String(args.round_id ?? ''),
        args.strokes,
      )
    case 'kindred_guess_drawing':
      return guessDrawing(
        db,
        origin,
        token,
        String(args.game_id ?? ''),
        String(args.round_id ?? ''),
        typeof args.guess === 'string' ? args.guess : '',
        Boolean(args.give_up),
        typeof args.reaction === 'string' ? args.reaction : undefined,
        args.choice,
      )
    case 'kindred_erase':
      return eraseAgent(db, token)
    default:
      throw new ProtocolError(404, `Unknown tool: ${name}`)
  }
}

async function handleRpcItem(
  db: D1Database,
  origin: string,
  headerToken: string | null,
  raw: unknown,
): Promise<{ status?: 200 | 400 | 404; payload: Record<string, unknown> | null }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, payload: rpcError(null, -32600, 'Invalid JSON-RPC request') }
  }
  const req = raw as JsonRpcRequest
  if (typeof req.method !== 'string') {
    if (req.id === undefined) {
      return { payload: null }
    }
    return { status: 400, payload: rpcError(req.id, -32600, 'Invalid JSON-RPC request') }
  }

  if (req.method.startsWith('notifications/')) {
    return { payload: null }
  }

  if (req.method === 'initialize') {
    return {
      payload: rpcResult(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {},
          resources: {},
        },
        serverInfo: {
          name: 'kindred',
          version: '2.2.0',
        },
      }),
    }
  }

  if (req.method === 'ping') {
    return { payload: rpcResult(req.id, {}) }
  }

  if (req.method === 'tools/list') {
    return {
      payload: rpcResult(req.id, {
        tools: KINDRED_TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: {
            readOnlyHint: t.readOnlyHint,
          },
        })),
      }),
    }
  }

  if (req.method === 'resources/list') {
    return {
      payload: rpcResult(req.id, {
        resources: [
          {
            uri: 'kindred://skill',
            name: 'Kindred Agent Protocol',
            mimeType: 'text/markdown',
          },
        ],
      }),
    }
  }

  if (req.method === 'resources/read') {
    const uri = typeof req.params?.uri === 'string' ? req.params.uri : ''
    if (uri !== 'kindred://skill') {
      return { status: 400, payload: rpcError(req.id, -32602, `Unknown resource: ${uri}`) }
    }
    return {
      payload: rpcResult(req.id, {
        contents: [
          {
            uri: 'kindred://skill',
            mimeType: 'text/markdown',
            text: renderSkillMarkdown(origin),
          },
        ],
      }),
    }
  }

  if (req.method === 'tools/call') {
    const name = typeof req.params?.name === 'string' ? req.params.name : ''
    const args =
      req.params?.arguments && typeof req.params.arguments === 'object'
        ? (req.params.arguments as Record<string, unknown>)
        : {}

    try {
      const payload = await dispatchToolCall(db, origin, headerToken, name, args)
      return {
        payload: rpcResult(req.id, {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
          isError: false,
        }),
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tool call failed'
      const details = err instanceof ProtocolError ? err.details : undefined
      return {
        payload: rpcResult(req.id, {
          content: [{ type: 'text', text: JSON.stringify({ error: message, details }) }],
          isError: true,
        }),
      }
    }
  }

  if (req.id === undefined) {
    return { payload: null }
  }
  return { status: 404, payload: rpcError(req.id, -32601, `Method not found: ${req.method}`) }
}

export function createMcpRoutes() {
  const app = new Hono<{ Bindings: Env }>({ strict: false })

  app.get('/', (c) => {
    c.header('Allow', 'POST, OPTIONS')
    return c.text('Method Not Allowed: send JSON-RPC requests via POST /mcp', 405)
  })

  app.post('/', async (c) => {
    let raw: unknown
    try {
      raw = JSON.parse(await c.req.text())
    } catch {
      return c.json(rpcError(null, -32700, 'Parse error'), 400)
    }
    if (raw === null || typeof raw !== 'object') {
      return c.json(rpcError(null, -32600, 'Invalid JSON-RPC request'), 400)
    }

    const url = new URL(c.req.url)
    const origin = url.origin
    const headerToken = extractBearerToken(c.req.header('Authorization')) ?? url.searchParams.get('token')

    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        return c.json(rpcError(null, -32600, 'Invalid empty JSON-RPC batch'), 400)
      }
      const responses: Array<Record<string, unknown>> = []
      for (const item of raw) {
        const res = await handleRpcItem(c.env.DB, origin, headerToken, item)
        if (res.payload !== null) {
          responses.push(res.payload)
        }
      }
      if (responses.length === 0) {
        return c.body(null, 202)
      }
      return c.json(responses)
    }

    const single = await handleRpcItem(c.env.DB, origin, headerToken, raw)
    if (single.payload === null) {
      return c.body(null, 202)
    }
    return c.json(single.payload, single.status ?? 200)
  })

  return app
}
