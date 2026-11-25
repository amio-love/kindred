import { Hono } from 'hono'
import { KINDRED_TOOLS } from '../shared/mcpTools'
import { renderSkillMarkdown } from '../shared/skillTemplate'
import { extractBearerToken, type Env } from './env'
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
    case 'kindred_publish_quiz':
      return publishQuiz(db, origin, token, args.questions)
    case 'kindred_inbox':
      return getInbox(db, origin, token)
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
        args.surface_decoys,
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

export function createMcpRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  app.get('/', (c) => {
    const origin = new URL(c.req.url).origin
    return c.json({
      name: 'kindred',
      transport: 'streamable-http',
      protocolVersion: PROTOCOL_VERSION,
      endpoint: `${origin}/mcp`,
      skill: `${origin}/skill.md`,
      tools: KINDRED_TOOLS.map((t) => t.name),
    })
  })

  app.post('/', async (c) => {
    const req = await c.req.json<JsonRpcRequest>().catch(() => null)
    if (!req || typeof req !== 'object' || typeof req.method !== 'string') {
      return c.json(rpcError(null, -32600, 'Invalid JSON-RPC request'), 400)
    }

    const url = new URL(c.req.url)
    const origin = url.origin
    const headerToken = extractBearerToken(c.req.header('Authorization')) ?? url.searchParams.get('token')

    if (req.method === 'notifications/initialized') {
      return c.body(null, 202)
    }

    if (req.method === 'initialize') {
      return c.json(
        rpcResult(req.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: {
            name: 'kindred',
            version: '2.0.0',
          },
        }),
      )
    }

    if (req.method === 'ping') {
      return c.json(rpcResult(req.id, {}))
    }

    if (req.method === 'tools/list') {
      return c.json(
        rpcResult(req.id, {
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
      )
    }

    if (req.method === 'resources/list') {
      return c.json(
        rpcResult(req.id, {
          resources: [
            {
              uri: 'kindred://skill',
              name: 'Kindred Agent Protocol',
              mimeType: 'text/markdown',
            },
          ],
        }),
      )
    }

    if (req.method === 'resources/read') {
      const uri = typeof req.params?.uri === 'string' ? req.params.uri : ''
      if (uri !== 'kindred://skill') {
        return c.json(rpcError(req.id, -32602, `Unknown resource: ${uri}`), 400)
      }
      return c.json(
        rpcResult(req.id, {
          contents: [
            {
              uri: 'kindred://skill',
              mimeType: 'text/markdown',
              text: renderSkillMarkdown(origin),
            },
          ],
        }),
      )
    }

    if (req.method === 'tools/call') {
      const name = typeof req.params?.name === 'string' ? req.params.name : ''
      const args =
        req.params?.arguments && typeof req.params.arguments === 'object'
          ? (req.params.arguments as Record<string, unknown>)
          : {}

      try {
        const payload = await dispatchToolCall(c.env.DB, origin, headerToken, name, args)
        return c.json(
          rpcResult(req.id, {
            content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
            structuredContent: payload,
            isError: false,
          }),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Tool call failed'
        const details = err instanceof ProtocolError ? err.details : undefined
        return c.json(
          rpcResult(req.id, {
            content: [{ type: 'text', text: JSON.stringify({ error: message, details }) }],
            isError: true,
          }),
        )
      }
    }

    return c.json(rpcError(req.id, -32601, `Method not found: ${req.method}`), 404)
  })

  return app
}
