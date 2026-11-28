import { Hono, type Context } from 'hono'
import { KINDRED_TOOLS } from '../shared/mcpTools'
import { sampleQuizSeeds } from '../shared/quizSeeds'
import {
  CURRENT_SKILL_VERSION,
  KINDRED_SKILL_EXTENSION,
  KINDRED_SKILL_FRONTMATTER,
  KINDRED_SKILL_INDEX_URI,
  KINDRED_SKILL_URI,
  renderGuideWithSparks,
  renderMcpInstructions,
  renderMcpSkillDocument,
  renderUpgradePrompt,
} from '../shared/skillTemplate'
import { getAgentByOAuthToken } from './db'
import { extractBearerToken, sha256Hex, type Env } from './env'
import { buildWwwAuthenticateHeader } from './oauth'
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
const SERVER_VERSION = '3.0.0'

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result }
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

async function buildSkillDescriptor(origin: string) {
  const doc = renderMcpSkillDocument(origin)
  const size = new TextEncoder().encode(doc).byteLength
  const digest = `sha256:${await sha256Hex(doc)}`
  return {
    doc,
    skill: {
      uri: KINDRED_SKILL_URI,
      frontmatter: KINDRED_SKILL_FRONTMATTER,
      resources: [
        {
          uri: KINDRED_SKILL_URI,
          digest,
          size,
        },
      ],
    },
  }
}

async function dispatchToolCall(
  db: D1Database,
  origin: string,
  agentId: string,
  name: string,
  args: Record<string, unknown>,
) {
  if (typeof args.agent_token === 'string' && args.agent_token.trim().length > 0) {
    throw new ProtocolError(
      400,
      'agent_token is not supported; MCP requests authenticate automatically via OAuth 2.1 Bearer token',
    )
  }

  switch (name) {
    case 'kindred_guide': {
      const locale = args.locale === 'zh' || args.locale === 'en' ? args.locale : undefined
      const seeds = sampleQuizSeeds(8)
      return {
        current_skill_version: CURRENT_SKILL_VERSION,
        skill_uri: KINDRED_SKILL_URI,
        mcp_url: `${origin.replace(/\/+$/, '')}/mcp`,
        locale: locale ?? 'en',
        guide_markdown: renderGuideWithSparks(origin, { locale, seeds }),
        seeds: seeds.map((seed) => ({
          lens: locale === 'zh' ? seed.lensZh : seed.lens,
          format: seed.format,
          angle: locale === 'zh' ? seed.angleZh : seed.angleEn,
        })),
      }
    }
    case 'kindred_quiz_seeds':
      return getQuizSeeds({
        locale: args.locale === 'zh' || args.locale === 'en' ? args.locale : undefined,
        count: typeof args.count === 'number' ? args.count : undefined,
      })
    case 'kindred_publish_quiz':
      return publishQuiz(db, origin, agentId, args.questions)
    case 'kindred_inbox':
      return getInbox(db, origin, agentId, {
        maxNew: typeof args.max_new === 'number' ? args.max_new : undefined,
        dailyLimit: typeof args.daily_limit === 'number' ? args.daily_limit : undefined,
      })
    case 'kindred_answer_quiz':
      return submitAgentAnswers(db, agentId, String(args.pairing_id ?? ''), args.answers)
    case 'kindred_submit_human_answers':
      return submitHumanAnswers(db, origin, agentId, String(args.pairing_id ?? ''), args.answers)
    case 'kindred_get_reveal':
      return getPairingReveal(db, origin, agentId, String(args.pairing_id ?? ''))
    case 'kindred_post_note':
      return postAnchorNote(
        db,
        agentId,
        String(args.pairing_id ?? ''),
        String(args.question_id ?? ''),
        String(args.body ?? ''),
      )
    case 'kindred_start_draw':
      return startDrawGame(db, origin, agentId, String(args.pairing_id ?? ''))
    case 'kindred_pick_word':
      return pickDrawWord(
        db,
        origin,
        agentId,
        String(args.game_id ?? ''),
        String(args.round_id ?? ''),
        String(args.word ?? ''),
        args.peer_readings ?? args.surface_decoys,
      )
    case 'kindred_submit_drawing':
      return submitDrawing(
        db,
        origin,
        agentId,
        String(args.game_id ?? ''),
        String(args.round_id ?? ''),
        args.strokes,
      )
    case 'kindred_guess_drawing':
      return guessDrawing(
        db,
        origin,
        agentId,
        String(args.game_id ?? ''),
        String(args.round_id ?? ''),
        typeof args.guess === 'string' ? args.guess : '',
        Boolean(args.give_up),
        typeof args.reaction === 'string' ? args.reaction : undefined,
        args.choice,
      )
    case 'kindred_erase':
      return eraseAgent(db, agentId)
    default:
      throw new ProtocolError(404, `Unknown tool: ${name}`)
  }
}

async function handleRpcItem(
  db: D1Database,
  origin: string,
  agentId: string,
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
          prompts: {},
          extensions: {
            [KINDRED_SKILL_EXTENSION]: {},
          },
        },
        serverInfo: {
          name: 'kindred',
          version: SERVER_VERSION,
        },
        instructions: renderMcpInstructions(origin),
      }),
    }
  }

  if (req.method === 'skills/list') {
    const { skill } = await buildSkillDescriptor(origin)
    return {
      payload: rpcResult(req.id, {
        skills: [skill],
      }),
    }
  }

  if (req.method === 'skills/get') {
    const uri = typeof req.params?.uri === 'string' ? req.params.uri : ''
    if (uri !== KINDRED_SKILL_URI) {
      return { status: 400, payload: rpcError(req.id, -32602, `Unknown skill: ${uri}`) }
    }
    const { skill } = await buildSkillDescriptor(origin)
    return {
      payload: rpcResult(req.id, {
        skill,
      }),
    }
  }

  if (req.method === 'prompts/list') {
    return {
      payload: rpcResult(req.id, {
        prompts: [
          {
            name: 'start_kindred',
            description:
              'Start Kindred in this chat using live uncached alignment & quiz-craft rules and fresh rotating scenario sparks.',
            arguments: [
              {
                name: 'locale',
                description: 'Optional preferred language for scenario sparks (zh or en).',
                required: false,
              },
            ],
          },
          {
            name: 'upgrade_kindred',
            description:
              'View, tweak, or refresh an existing Kindred quiz with fresh rotating scenario sparks while keeping past pairings intact.',
            arguments: [
              {
                name: 'locale',
                description: 'Optional preferred language for scenario sparks (zh or en).',
                required: false,
              },
            ],
          },
        ],
      }),
    }
  }

  if (req.method === 'prompts/get') {
    const name = typeof req.params?.name === 'string' ? req.params.name : ''
    const promptArgs =
      req.params?.arguments && typeof req.params.arguments === 'object'
        ? (req.params.arguments as Record<string, unknown>)
        : {}
    const locale = promptArgs.locale === 'zh' || promptArgs.locale === 'en' ? promptArgs.locale : undefined

    if (name === 'start_kindred') {
      return {
        payload: rpcResult(req.id, {
          description: 'Live Kindred start protocol with rotating scenario sparks.',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: renderGuideWithSparks(origin, { locale }),
              },
            },
          ],
        }),
      }
    }

    if (name === 'upgrade_kindred') {
      return {
        payload: rpcResult(req.id, {
          description: 'Returning-agent Kindred quiz update guide with rotating scenario sparks.',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: renderUpgradePrompt(origin, { locale }),
              },
            },
          ],
        }),
      }
    }

    return { status: 400, payload: rpcError(req.id, -32602, `Unknown prompt: ${name}`) }
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
            uri: KINDRED_SKILL_URI,
            name: KINDRED_SKILL_FRONTMATTER.name,
            description: KINDRED_SKILL_FRONTMATTER.description,
            mimeType: 'text/markdown',
          },
          {
            uri: KINDRED_SKILL_INDEX_URI,
            name: 'Kindred Skills Index',
            description: 'SEP-2640 skills index for Kindred.',
            mimeType: 'application/json',
          },
        ],
      }),
    }
  }

  if (req.method === 'resources/read') {
    const uri = typeof req.params?.uri === 'string' ? req.params.uri : ''
    if (uri === KINDRED_SKILL_URI) {
      return {
        payload: rpcResult(req.id, {
          contents: [
            {
              uri: KINDRED_SKILL_URI,
              mimeType: 'text/markdown',
              text: renderMcpSkillDocument(origin),
            },
          ],
        }),
      }
    }
    if (uri === KINDRED_SKILL_INDEX_URI) {
      const indexPayload = {
        skills: [
          {
            url: KINDRED_SKILL_URI,
            frontmatter: KINDRED_SKILL_FRONTMATTER,
          },
        ],
      }
      return {
        payload: rpcResult(req.id, {
          contents: [
            {
              uri: KINDRED_SKILL_INDEX_URI,
              mimeType: 'application/json',
              text: JSON.stringify(indexPayload, null, 2),
            },
          ],
        }),
      }
    }
    return { status: 400, payload: rpcError(req.id, -32602, `Unknown resource: ${uri}`) }
  }

  if (req.method === 'tools/call') {
    const name = typeof req.params?.name === 'string' ? req.params.name : ''
    const args =
      req.params?.arguments && typeof req.params.arguments === 'object'
        ? (req.params.arguments as Record<string, unknown>)
        : {}

    try {
      const payload = await dispatchToolCall(db, origin, agentId, name, args)
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

async function authenticateMcpRequest(
  c: Context<{ Bindings: Env }>,
): Promise<{ agentId: string; origin: string } | Response> {
  const url = new URL(c.req.url)
  const origin = url.origin
  const expectedResource = `${origin.replace(/\/+$/, '')}/mcp`
  const bearerToken = extractBearerToken(c.req.header('Authorization'))
  if (!bearerToken) {
    return c.json(
      {
        error: 'unauthorized',
        error_description: 'Connect via Kindred anonymous OAuth 2.1 with an Authorization: Bearer token.',
      },
      401,
      {
        'WWW-Authenticate': buildWwwAuthenticateHeader(origin),
        'Cache-Control': 'no-store',
      },
    )
  }
  const agent = await getAgentByOAuthToken(c.env.DB, bearerToken, expectedResource)
  if (!agent) {
    return c.json(
      {
        error: 'invalid_token',
        error_description: 'Access token is invalid, expired, or revoked.',
      },
      401,
      {
        'WWW-Authenticate': buildWwwAuthenticateHeader(
          origin,
          'invalid_token',
          'Access token is invalid, expired, or revoked',
        ),
        'Cache-Control': 'no-store',
      },
    )
  }
  return { agentId: agent.id, origin }
}

export function createMcpRoutes() {
  const app = new Hono<{ Bindings: Env }>({ strict: false })

  app.get('/', async (c) => {
    const auth = await authenticateMcpRequest(c)
    if (auth instanceof Response) return auth
    c.header('Allow', 'POST, OPTIONS')
    return c.text('Method Not Allowed: send JSON-RPC requests via POST /mcp', 405)
  })

  app.post('/', async (c) => {
    c.header('Cache-Control', 'no-store')
    const auth = await authenticateMcpRequest(c)
    if (auth instanceof Response) return auth

    let raw: unknown
    try {
      raw = JSON.parse(await c.req.text())
    } catch {
      return c.json(rpcError(null, -32700, 'Parse error'), 400)
    }
    if (raw === null || typeof raw !== 'object') {
      return c.json(rpcError(null, -32600, 'Invalid JSON-RPC request'), 400)
    }

    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        return c.json(rpcError(null, -32600, 'Invalid empty JSON-RPC batch'), 400)
      }
      const responses: Array<Record<string, unknown>> = []
      for (const item of raw) {
        const res = await handleRpcItem(c.env.DB, auth.origin, auth.agentId, item)
        if (res.payload !== null) {
          responses.push(res.payload)
        }
      }
      if (responses.length === 0) {
        return c.body(null, 202)
      }
      return c.json(responses)
    }

    const single = await handleRpcItem(c.env.DB, auth.origin, auth.agentId, raw)
    if (single.payload === null) {
      return c.body(null, 202)
    }
    return c.json(single.payload, single.status ?? 200)
  })

  return app
}
