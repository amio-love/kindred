import { renderSkillMarkdown } from '../shared/skillTemplate'

export const DISCOVERY_LINK_HEADER =
  '</.well-known/mcp.json>; rel="describedby"; type="application/json", </skill.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="alternate"; type="text/plain"'

const NON_INTERACTIVE_AGENT_UA_RE =
  /claude-user|claudebot|anthropic-ai|chatgpt-user|oai-searchbot|gptbot|perplexity-user|perplexitybot|mistralai-user|bytespider|curl\/|wget\/|httpie|python-requests|python-httpx|aiohttp|undici|node-fetch|axios\/|go-http-client|bun\/|jina|firecrawl|tavily|exa-bot/i

function parseQuality(acceptHeader: string, targetType: string): number {
  const parts = acceptHeader.toLowerCase().split(',')
  let best = -1
  for (const raw of parts) {
    const [mediaRaw, ...params] = raw.trim().split(';')
    const media = mediaRaw?.trim() ?? ''
    if (media !== targetType) continue
    let q = 1
    for (const param of params) {
      const [k, v] = param.trim().split('=')
      if (k === 'q' && v !== undefined) {
        const parsed = Number.parseFloat(v)
        if (Number.isFinite(parsed)) q = parsed
      }
    }
    if (q > best) best = q
  }
  return best
}

export function prefersMarkdownResponse(request: Request): boolean {
  const accept = (request.headers.get('Accept') ?? '').trim()
  const markdownQ = Math.max(
    parseQuality(accept, 'text/markdown'),
    parseQuality(accept, 'text/plain'),
  )
  const htmlQ = Math.max(
    parseQuality(accept, 'text/html'),
    parseQuality(accept, 'application/xhtml+xml'),
  )

  if (markdownQ > 0 && markdownQ >= htmlQ) return true
  if (htmlQ <= 0) return true

  const secFetchDest = (request.headers.get('Sec-Fetch-Dest') ?? '').toLowerCase()
  const secFetchMode = (request.headers.get('Sec-Fetch-Mode') ?? '').toLowerCase()
  if (secFetchDest === 'document' || secFetchMode === 'navigate') return false

  const ua = request.headers.get('User-Agent') ?? ''
  return NON_INTERACTIVE_AGENT_UA_RE.test(ua)
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderAgentFallbackHtml(origin: string): string {
  const markdown = renderSkillMarkdown(origin)
  const lines = markdown.split('\n')
  const blocks: string[] = []
  let inCode = false
  let codeLines: string[] = []
  let listTag: 'ul' | 'ol' | null = null

  const flushList = () => {
    if (listTag) {
      blocks.push(`</${listTag}>`)
      listTag = null
    }
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      flushList()
      if (!inCode) {
        inCode = true
        codeLines = []
      } else {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        inCode = false
        codeLines = []
      }
      continue
    }
    if (inCode) {
      codeLines.push(line)
      continue
    }

    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }
    if (trimmed === '---') {
      flushList()
      blocks.push('<hr />')
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (heading) {
      flushList()
      const level = heading[1]!.length
      blocks.push(`<h${level}>${escapeHtml(heading[2]!)}</h${level}>`)
      continue
    }

    const ulItem = /^-\s+(.+)$/.exec(trimmed)
    if (ulItem) {
      if (listTag !== 'ul') {
        flushList()
        listTag = 'ul'
        blocks.push('<ul>')
      }
      blocks.push(`<li>${escapeHtml(ulItem[1]!)}</li>`)
      continue
    }

    const olItem = /^\d+\.\s+(.+)$/.exec(trimmed)
    if (olItem) {
      if (listTag !== 'ol') {
        flushList()
        listTag = 'ol'
        blocks.push('<ol>')
      }
      blocks.push(`<li>${escapeHtml(olItem[1]!)}</li>`)
      continue
    }

    flushList()
    blocks.push(`<p>${escapeHtml(trimmed)}</p>`)
  }

  flushList()
  if (inCode && codeLines.length > 0) {
    blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  }

  return `<main class="agent-ssr-skill" data-kindred-protocol="true"><article>${blocks.join('')}</article></main>`
}

export function injectAgentFallbackHtml(indexHtml: string, origin: string): string {
  const fallback = renderAgentFallbackHtml(origin)
  if (indexHtml.includes('<div id="root"></div>')) {
    return indexHtml.replace('<div id="root"></div>', `<div id="root">${fallback}</div>`)
  }
  if (indexHtml.includes('</body>')) {
    return indexHtml.replace('</body>', `${fallback}</body>`)
  }
  return `${indexHtml}${fallback}`
}
