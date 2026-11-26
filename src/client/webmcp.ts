import { KINDRED_TOOLS } from '../shared/mcpTools'

interface WebMcpToolRegistration {
  name: string
  title?: string
  description: string
  inputSchema?: Record<string, unknown>
  readOnlyHint?: boolean
  annotations?: { readOnlyHint?: boolean }
  execute: (
    args: Record<string, unknown>,
    ctx?: { signal?: AbortSignal },
  ) => Promise<unknown>
}

interface ModelContextApi {
  registerTool: (
    tool: WebMcpToolRegistration,
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>
}

export interface WebMcpState {
  supported: boolean
  surface: 'document.modelContext' | 'navigator.modelContext' | 'none'
  registeredCount: number
}

function resolveModelContext(): {
  api: ModelContextApi | null
  surface: WebMcpState['surface']
} {
  if (typeof document !== 'undefined') {
    const docCtx = (document as unknown as { modelContext?: ModelContextApi }).modelContext
    if (docCtx && typeof docCtx.registerTool === 'function') {
      return { api: docCtx, surface: 'document.modelContext' }
    }
  }
  if (typeof navigator !== 'undefined') {
    const navCtx = (navigator as unknown as { modelContext?: ModelContextApi }).modelContext
    if (navCtx && typeof navCtx.registerTool === 'function') {
      return { api: navCtx, surface: 'navigator.modelContext' }
    }
  }
  return { api: null, surface: 'none' }
}

let sessionAgentToken: string | null = null

async function callKindredHttpTool(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const explicitToken =
    typeof args.agent_token === 'string' && args.agent_token.trim() ? args.agent_token.trim() : null
  if (explicitToken && sessionAgentToken && explicitToken !== sessionAgentToken) {
    sessionAgentToken = null
  }
  const token = explicitToken ?? sessionAgentToken
  if (name === 'kindred_erase' && !token) {
    throw new Error('Explicit agent_token is required to erase after switching identities or before publishing')
  }
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  if (name === 'kindred_guide') {
    const locale = args.locale === 'zh' || args.locale === 'en' ? args.locale : undefined
    const query = locale ? `?locale=${locale}` : ''
    const [skillRes, seedsRes] = await Promise.all([
      fetch(`/skill.md${query}`, { signal }),
      fetch(`/api/quiz/seeds${query}`, { signal }),
    ])
    const [guideMarkdown, seedsJson] = await Promise.all([
      skillRes.text(),
      seedsRes.json() as Promise<{ current_skill_version?: number; locale?: string; seeds?: unknown }>,
    ])
    return {
      current_skill_version: seedsJson.current_skill_version ?? 2,
      mcp_url: `${window.location.origin}/mcp`,
      locale: seedsJson.locale ?? locale ?? 'en',
      guide_markdown: guideMarkdown,
      seeds: seedsJson.seeds ?? [],
    }
  }

  if (name === 'kindred_quiz_seeds') {
    const params = new URLSearchParams()
    if (args.locale === 'zh' || args.locale === 'en') params.set('locale', args.locale)
    if (typeof args.count === 'number') params.set('count', String(args.count))
    const qs = params.toString()
    const res = await fetch(`/api/quiz/seeds${qs ? `?${qs}` : ''}`, { signal })
    return res.json()
  }

  let method: 'GET' | 'POST' | 'DELETE' = 'POST'
  let path = '/api/quiz'
  let body: unknown

  switch (name) {
    case 'kindred_publish_quiz':
      method = 'POST'
      path = '/api/quiz'
      body = { questions: args.questions }
      break
    case 'kindred_inbox': {
      method = 'GET'
      const params = new URLSearchParams()
      if (typeof args.max_new === 'number') params.set('max_new', String(args.max_new))
      if (typeof args.daily_limit === 'number') params.set('daily_limit', String(args.daily_limit))
      const qs = params.toString()
      path = `/api/inbox${qs ? `?${qs}` : ''}`
      break
    }
    case 'kindred_answer_quiz':
      path = `/api/pairings/${encodeURIComponent(String(args.pairing_id ?? ''))}/agent-answers`
      body = { answers: args.answers }
      break
    case 'kindred_submit_human_answers':
      path = `/api/pairings/${encodeURIComponent(String(args.pairing_id ?? ''))}/human-answers`
      body = { answers: args.answers }
      break
    case 'kindred_get_reveal':
      method = 'GET'
      path = `/api/pairings/${encodeURIComponent(String(args.pairing_id ?? ''))}/reveal`
      break
    case 'kindred_post_note':
      path = `/api/pairings/${encodeURIComponent(String(args.pairing_id ?? ''))}/notes`
      body = { question_id: args.question_id, body: args.body }
      break
    case 'kindred_start_draw':
      path = `/api/pairings/${encodeURIComponent(String(args.pairing_id ?? ''))}/draw`
      body = {}
      break
    case 'kindred_pick_word':
      path = `/api/draw/${encodeURIComponent(String(args.game_id ?? ''))}/rounds/${encodeURIComponent(String(args.round_id ?? ''))}/word`
      body = { word: args.word, peer_readings: args.peer_readings }
      break
    case 'kindred_submit_drawing':
      path = `/api/draw/${encodeURIComponent(String(args.game_id ?? ''))}/rounds/${encodeURIComponent(String(args.round_id ?? ''))}/drawing`
      body = { strokes: args.strokes }
      break
    case 'kindred_guess_drawing':
      path = `/api/draw/${encodeURIComponent(String(args.game_id ?? ''))}/rounds/${encodeURIComponent(String(args.round_id ?? ''))}/guess`
      body = {
        choice: args.choice,
        guess: args.guess,
        give_up: args.give_up,
        reaction: args.reaction,
      }
      break
    case 'kindred_erase':
      method = 'DELETE'
      path = '/api/agent'
      break
    default:
      throw new Error(`Unknown tool: ${name}`)
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(path, {
    method,
    headers,
    signal,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const payload = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Tool call failed')
  }
  if (name === 'kindred_publish_quiz') {
    if (typeof payload.agent_token === 'string') {
      sessionAgentToken = payload.agent_token
    } else if (explicitToken) {
      sessionAgentToken = explicitToken
    }
  }
  if (name === 'kindred_erase' && token && sessionAgentToken === token) {
    sessionAgentToken = null
  }
  return payload
}

export function registerKindredWebMcp(): { state: WebMcpState; cleanup: () => void } {
  const { api, surface } = resolveModelContext()
  if (!api) {
    return {
      state: { supported: false, surface: 'none', registeredCount: 0 },
      cleanup: () => {},
    }
  }

  const controller = new AbortController()
  let registeredCount = 0

  for (const tool of KINDRED_TOOLS) {
    try {
      api.registerTool(
        {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          readOnlyHint: tool.readOnlyHint,
          annotations: { readOnlyHint: tool.readOnlyHint },
          execute: (args, ctx) => callKindredHttpTool(tool.name, args, ctx?.signal),
        },
        { signal: controller.signal },
      )
      registeredCount += 1
    } catch {
      continue
    }
  }

  return {
    state: { supported: true, surface, registeredCount },
    cleanup: () => controller.abort(),
  }
}
