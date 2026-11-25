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

async function callMcpTool(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const res = await fetch('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args ?? {} },
    }),
  })
  const payload = (await res.json()) as {
    result?: { structuredContent?: unknown; content?: Array<{ text?: string }>; isError?: boolean }
    error?: { message?: string }
  }
  if (payload.error) {
    throw new Error(payload.error.message ?? 'MCP error')
  }
  if (payload.result?.isError) {
    throw new Error(payload.result.content?.[0]?.text ?? 'Tool call failed')
  }
  if (payload.result?.structuredContent !== undefined) {
    return payload.result.structuredContent
  }
  const text = payload.result?.content?.[0]?.text
  return text ? JSON.parse(text) : {}
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
          execute: (args, ctx) => callMcpTool(tool.name, args, ctx?.signal),
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
