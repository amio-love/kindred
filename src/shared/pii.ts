export interface PiiFinding {
  category: 'email' | 'phone' | 'url' | 'china_id' | 'social_handle'
  excerpt: string
}

const ZERO_WIDTH_RE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/g

const CODE_OR_FILE_EXTS = new Set([
  'js',
  'ts',
  'jsx',
  'tsx',
  'mjs',
  'cjs',
  'py',
  'rb',
  'go',
  'rs',
  'md',
  'txt',
  'json',
  'yaml',
  'yml',
  'toml',
  'xml',
  'html',
  'css',
  'scss',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'mp4',
  'pdf',
  'zip',
  'tar',
  'gz',
  'sh',
  'sql',
  'csv',
  'env',
  'exe',
  'dmg',
  'apk',
  'ipa',
  'vue',
  'svelte',
  'php',
  'java',
  'cpp',
  'swift',
  'kt',
])

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'prof'])
const TECH_NON_URL_NAMES = new Set(['asp.net', 'vb.net', 'ado.net', 'paint.net'])
const RANKING_RE = /^top\d{1,4}$/i
const PRODUCT_MODEL_RE =
  /^(?:iphone|ipad|ios|macos|macbook|watchos|pixel|galaxy|redmi|mi|mate|nova|ps|xbox|switch|gpt|claude|qwen|deepseek|llama|gemini|grok|rtx|gtx|m|v)\d+[a-z0-9]*$/i
const SEMVER_RE = /^v\d+(?:\.\d+)+$/i
const DECADE_OR_SLANG_RE = /^y2k$/i

function isDistinctiveHandle(token: string): boolean {
  if (token.length < 3 || token.length > 32) return false
  if (!/^[A-Za-z]/.test(token)) return false
  if (RANKING_RE.test(token)) return false
  if (PRODUCT_MODEL_RE.test(token)) return false
  if (SEMVER_RE.test(token)) return false
  if (DECADE_OR_SLANG_RE.test(token)) return false
  if (TECH_NON_URL_NAMES.has(token.toLowerCase())) return false
  const dotParts = token.split('.')
  if (dotParts.length === 2) {
    if (HONORIFICS.has(dotParts[0]!.toLowerCase())) return false
    if (CODE_OR_FILE_EXTS.has(dotParts[1]!.toLowerCase())) return false
  }
  if (token.includes('_') || token.includes('.')) return true
  return token.length >= 4 && /\d/.test(token)
}

function isFollowedByChineseTopic(text: string, matchEnd: number): boolean {
  const rest = text.slice(matchEnd)
  return /^[ \t]*(?:歌单|路线|攻略|热搜|穿搭|教程|测评|清单|合集|推荐|日常|打卡|视频|直播|笔记|影评|书单|实拍)/.test(
    rest,
  )
}

const DIRECT_PATTERNS: ReadonlyArray<{ category: PiiFinding['category']; pattern: RegExp }> = [
  { category: 'email', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { category: 'url', pattern: /https?:\/\/[^\s]+/gi },
  {
    category: 'url',
    pattern: /\bwww\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,24})+(?:\/[^\s]*)?/gi,
  },
  {
    category: 'china_id',
    pattern: /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
  },
  {
    category: 'china_id',
    pattern: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
  },
  {
    category: 'phone',
    pattern: /(?<!\d)(?:\+?86[\s.-]?)?1[3-9]\d[\s.-]?\d{4}[\s.-]?\d{4}(?!\d)/g,
  },
  {
    category: 'phone',
    pattern: /(?<!\d)(?:\(0(?:10|2\d|[3-9]\d{2})\)\s*|0(?:10|2\d|[3-9]\d{2})[\s-])[2-9]\d{2,3}[\s-]?\d{4}(?!\d)/g,
  },
  {
    category: 'phone',
    pattern: /(?<!\d)\+\d{1,3}[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?){2,5}\d{2,4}(?!\d)/g,
  },
  {
    category: 'phone',
    pattern: /(?<!\d)(?:\([2-9]\d{2}\)[\s.-]?[2-9]\d{2}[\s.-]\d{4}|[2-9]\d{2}[.-][2-9]\d{2}[.-]\d{4})(?!\d)/g,
  },
  {
    category: 'social_handle',
    pattern: /(?<![A-Za-z0-9._%+-])@[A-Za-z][A-Za-z0-9_.-]{2,31}\b/g,
  },
  {
    category: 'social_handle',
    pattern: /\b[A-Za-z0-9_.-]{2,32}#\d{4}\b/g,
  },
  {
    category: 'social_handle',
    pattern: /(?:\bqq|扣扣|加\s*q|\bq\s*群|\bq\s*号)\s*(?:群|(?:账|帐)?号|ID)?\s*(?:是|为|叫)?\s*[:：=]?\s*[1-9]\d{4,11}\b/gi,
  },
]

const PATH_URL_RE =
  /\b([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)\.([a-z]{2,12})\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/g

const SPACED_NANP_RE = /(?<!\d)([2-9]\d{2})\s+([2-9]\d{2})\s+(\d{4})(?!\d)/g

const TOKEN_RE = /[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?/g

const CN_PLATS =
  '(?:[vV微]信|微信|小红书|抖音|快手|微博|推特|企鹅|B站|b站|哔哩哔哩|知乎|豆瓣|贴吧|闲鱼|咸鱼)'
const CN_ALIAS_PLATS = '(?:(?<![A-Za-z])(?:wx|vx|weixin|tg|ig|ins|xhs))'
const EN_PLATS =
  '(?:wx|vx|weixin|wechat|telegram|tg|ins|ig|insta|instagram|twitter|xhs|discord|whatsapp|snapchat|snap|line|signal|tiktok|github|reddit|facebook|fb|linkedin|threads|bluesky|mastodon|letterboxd)'

const SHAPE_CUE_PATTERNS: readonly RegExp[] = [
  new RegExp(
    `(?:(?:我(?:的)?|本人)\\s*(?:(?:${CN_PLATS}|${EN_PLATS}|[vVxX])\\s*(?:(?:账|帐)?号|ID|名)?\\s*(?:是|为|叫|[:：=])?|[A-Za-z][A-Za-z0-9_-]{1,15}\\s*(?:(?:(?:账|帐)?号|ID|名)\\s*(?:是|为|叫|[:：=])?|(?:是|为|叫|[:：=])))|(?:加\\s*(?:我\\s*|个\\s*|一下\\s*)?(?:[vV微]|${CN_PLATS}|${EN_PLATS})\\s*(?:(?:账|帐)?号|ID)?\\s*(?:吧|呀|哈|聊)?\\s*[:：=]?)|(?:(?:${CN_PLATS}|${CN_ALIAS_PLATS})\\s*(?:搜(?:索)?\\s*[:：=]?|(?:(?:账|帐)?号|ID)\\s*(?:是|为|叫|[:：=])?|是|为|叫|[:：=]))|(?:${CN_PLATS}))\\s*$`,
    'i',
  ),
  /(?<![A-Za-z])[vVxX]\s*[:：=]\s*$/,
  new RegExp(
    `\\b${EN_PLATS}\\s*(?:(?:id|handle|account|username)\\s*)?(?:is\\s+|[:：=]\\s*|\\s+)$`,
    'i',
  ),
  new RegExp(
    `\\bmy\\s+(?:(?:${EN_PLATS}|[vVxX])(?:\\s+(?:id|handle|account|username))?|[A-Za-z][A-Za-z0-9_-]{1,18}\\s+(?:id|handle|account|username))\\s*(?:is\\s+|[:：=]\\s*)$`,
    'i',
  ),
  /\b(?:find|add|dm|message|reach|contact|follow|text)\s+me(?:\s+(?:(?:on|at)\s+[A-Za-z0-9_.-]+\s*(?:as\s+|at\s+|[:：=]\s*)|(?:as|at|on)\s+)|\s*[:：=]\s*)$/i,
]

const PURE_ALPHA_EXPLICIT_CUES: readonly RegExp[] = [
  /(?:(?:我(?:的)?|本人)?\s*(?:微信|[vV]信|(?<![A-Za-z])(?:wx|vx|weixin))\s*(?:(?:账|帐)?号|ID)?\s*(?:是|为|叫|[:：=])|加\s*(?:我|个|一下)?\s*(?:[vV微]|微信|[vV]信|(?<![A-Za-z])(?:wx|vx|weixin))\s*(?:(?:账|帐)?号|ID)?\s*(?:吧|呀|哈|聊)?\s*[:：=]?|(?:微信|[vV]信|(?<![A-Za-z])(?:wx|vx|weixin)|小红书|抖音|微博|推特|B站|b站)\s*(?:(?:账|帐)?号|ID)\s*(?:是|为|叫|[:：=])?)\s*$/i,
  new RegExp(
    `\\b(?:${EN_PLATS})\\s+(?:id|handle|username)\\s*(?:is\\s+|[:：=]\\s*)$`,
    'i',
  ),
  /\b(?:(?:find|add|dm|message|reach|contact|follow|text)\s+me\s+(?:on|at)\s+[A-Za-z0-9_.-]+\s*(?:as\s+|at\s+|[:：=]\s*)|(?:find|add|dm|follow)\s+me(?:\s+as\s+|\s*[:：=]\s*))$/i,
]

const PURE_DIGIT_EXPLICIT_CUE_RE =
  new RegExp(`(?:${CN_PLATS}|\\b${EN_PLATS})\\s*(?:(?:账|帐)?号|ID)\\s*(?:是|为|叫|[:：=])?\\s*$`, 'i')

const PURE_ALPHA_OR_HYPHEN_RE = /^[A-Za-z](?:[A-Za-z-]{4,30}[A-Za-z])$/

function hasCueBefore(before: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((re) => re.test(before))
}

export function scanPii(text: string): { clean: boolean; findings: PiiFinding[] } {
  const normalized = text.normalize('NFKC').replace(ZERO_WIDTH_RE, '')
  const findings: PiiFinding[] = []

  for (const { category, pattern } of DIRECT_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of normalized.matchAll(pattern)) {
      findings.push({ category, excerpt: match[0].slice(0, 32) })
    }
  }

  PATH_URL_RE.lastIndex = 0
  for (const match of normalized.matchAll(PATH_URL_RE)) {
    const host = (match[1] ?? '').toLowerCase()
    const ext = (match[2] ?? '').toLowerCase()
    if (HONORIFICS.has(host) || CODE_OR_FILE_EXTS.has(ext)) continue
    findings.push({ category: 'url', excerpt: match[0].slice(0, 32) })
  }

  SPACED_NANP_RE.lastIndex = 0
  for (const match of normalized.matchAll(SPACED_NANP_RE)) {
    const a = Number(match[1])
    const b = Number(match[2])
    const c = Number(match[3])
    if (a % 100 === 0 && b % 100 === 0 && c % 100 === 0) continue
    findings.push({ category: 'phone', excerpt: match[0].slice(0, 32) })
  }

  TOKEN_RE.lastIndex = 0
  for (const match of normalized.matchAll(TOKEN_RE)) {
    const tok = match[0]
    const start = match.index ?? 0
    const end = start + tok.length
    const before = normalized.slice(Math.max(0, start - 40), start)

    if (isDistinctiveHandle(tok)) {
      if (hasCueBefore(before, SHAPE_CUE_PATTERNS)) {
        findings.push({ category: 'social_handle', excerpt: tok.slice(0, 32) })
      }
    } else if (PURE_ALPHA_OR_HYPHEN_RE.test(tok)) {
      if (hasCueBefore(before, PURE_ALPHA_EXPLICIT_CUES) && !isFollowedByChineseTopic(normalized, end)) {
        findings.push({ category: 'social_handle', excerpt: tok.slice(0, 32) })
      }
    } else if (/^[1-9]\d{5,11}$/.test(tok)) {
      if (PURE_DIGIT_EXPLICIT_CUE_RE.test(before)) {
        findings.push({ category: 'social_handle', excerpt: tok.slice(0, 32) })
      }
    }
  }

  return { clean: findings.length === 0, findings }
}

export function scanPiiFields(fields: readonly string[]): { clean: boolean; findings: PiiFinding[] } {
  const findings: PiiFinding[] = []
  for (const field of fields) {
    const res = scanPii(field)
    if (!res.clean) {
      findings.push(...res.findings)
    }
  }
  return { clean: findings.length === 0, findings }
}
