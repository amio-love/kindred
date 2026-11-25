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

const TECH_NON_URL_NAMES = new Set(['asp.net', 'vb.net', 'ado.net', 'paint.net'])
const FOUR_DIGIT_YEAR_RE = /^(?:19|20)\d{2}$/
const RESOLUTION_RE = /^\d{3,4}[pPkK]$/
const RANKING_RE = /^top\d{1,4}$/i
const PURE_DIGITS_RE = /^\d+$/
const PRODUCT_MODEL_RE =
  /^(?:iphone|ipad|ios|macos|macbook|watchos|pixel|galaxy|redmi|mi|mate|nova|ps|xbox|switch|gpt|claude|qwen|deepseek|llama|gemini|grok|rtx|gtx|m|v)\d+[a-z0-9]*$/i

function hasDistinctiveHandleShape(rawToken: string): boolean {
  const trimmed = rawToken.replace(/[.-]+$/, '')
  const cleaned = trimmed.replace(/^@/, '')
  if (cleaned.length < 3) return false
  if (trimmed.startsWith('@')) return true
  if (FOUR_DIGIT_YEAR_RE.test(cleaned)) return false
  if (RESOLUTION_RE.test(cleaned)) return false
  if (RANKING_RE.test(cleaned)) return false
  if (PRODUCT_MODEL_RE.test(cleaned)) return false
  if (PURE_DIGITS_RE.test(cleaned)) return false
  if (TECH_NON_URL_NAMES.has(cleaned.toLowerCase())) return false
  const dotParts = cleaned.split('.')
  if (dotParts.length === 2 && CODE_OR_FILE_EXTS.has(dotParts[1]!.toLowerCase())) {
    return false
  }
  if (/[_.]/.test(cleaned)) return true
  return /[A-Za-z]/.test(cleaned) && /\d/.test(cleaned)
}

function isFollowedByProseOrTopic(text: string, matchEnd: number): boolean {
  const rest = text.slice(matchEnd)
  return /^[ \t]*(?:[ \t][A-Za-z]{2,}\b|歌单|路线|攻略|热搜|穿搭|教程|测评|清单|合集|推荐|日常|打卡|视频|直播|笔记|影评|书单|实拍)/.test(
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
    pattern: /(?:\bqq|扣扣|加\s*q|\bq\s*群|\bq\s*号)\s*(?:群|(?:账|帐)?号|ID)?\s*(?:是|为)?\s*[:：=]?\s*[1-9]\d{4,11}\b/gi,
  },
]

const PATH_URL_RE =
  /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.([a-z]{2,12})\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/gi

const PERSONAL_BARE_DOMAIN_RE =
  /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:me|dev|io|page|bio|link|site|club|xyz|gg)\b/gi

const SPACED_NANP_RE = /(?<!\d)([2-9]\d{2})\s+([2-9]\d{2})\s+(\d{4})(?!\d)/g

const CN_PLATS = '(?:[vV微]信|微信|小红书|抖音|快手|微博|企鹅|B站|b站|哔哩哔哩|知乎|豆瓣|贴吧|闲鱼|咸鱼)'
const EN_PLATS =
  '(?:wx|vx|weixin|wechat|telegram|tg|ins|ig|insta|instagram|twitter|xhs|discord|whatsapp|snapchat|snap|line|signal|tiktok|github|reddit|facebook|fb|linkedin|threads|bluesky|mastodon|letterboxd)'

const CN_OPEN_HANDLE_RE = new RegExp(
  `(?:(?:我(?:的)?|本人)\\s*(?:${CN_PLATS}|[A-Za-z][A-Za-z0-9_-]{1,15})\\s*(?:(?:账|帐)?号|ID|名)?\\s*(?:是|为)|(?:加\\s*(?:我\\s*|个\\s*|一下\\s*)?(?:[vV微]|${CN_PLATS}|${EN_PLATS})\\s*(?:吧|呀|哈|聊)?)|(?:(?:${CN_PLATS}|${EN_PLATS})\\s*(?:搜(?:索)?|(?:账|帐)?号|ID)\\s*(?:是|为)?))\\s*(?:[:：=]\\s*|\\s+|(?=[@A-Za-z0-9_.-]))(@?[A-Za-z0-9_.-]{3,})`,
  'gi',
)

const CN_WECHAT_ALPHA_RE =
  /(?:我(?:的)?|本人)?\s*(?:微信|[vV]信)\s*(?:(?:账|帐)?号|ID)?\s*(?:是|为|[:：=])\s*([A-Za-z][A-Za-z0-9_.-]{5,})/gi

const EN_OPEN_MY_RE =
  /\bmy\s+[A-Za-z][A-Za-z0-9_-]{1,18}(?:\s+(?:id|handle|account|username))?\s*(?:is\s+|[:：=]\s*)(@?[A-Za-z0-9_.-]{3,})/gi

const EN_OPEN_INVITE_RE =
  /\b(?:find|add|dm|message|reach|contact|follow|text)\s+me\s+(?:(?:on|at)\s+[A-Za-z0-9_.-]+\s*(?:as\s+|at\s+|[:：=]\s*)?|(?:as|at|on|:)\s*)(@?[A-Za-z0-9_.-]{3,})/gi

const PLATFORM_COLON_OR_SPACE_RE = new RegExp(
  `(?:${CN_PLATS}|\\b${EN_PLATS}\\b)\\s*(?:(?:id|handle|account|username)\\s*)?(?:([:：=])\\s*|\\s+)(@?[A-Za-z0-9_.-]{3,})`,
  'gi',
)

const STRONG_IM_COLON_ALPHA_RE =
  /\b(?:wx|vx|weixin|wechat|telegram|tg|xhs|snapchat|whatsapp|discord)\b\s*[:：=]\s*([A-Za-z]{8,})/gi

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
    const ext = (match[1] ?? '').toLowerCase()
    if (CODE_OR_FILE_EXTS.has(ext)) continue
    findings.push({ category: 'url', excerpt: match[0].slice(0, 32) })
  }

  PERSONAL_BARE_DOMAIN_RE.lastIndex = 0
  for (const match of normalized.matchAll(PERSONAL_BARE_DOMAIN_RE)) {
    if (TECH_NON_URL_NAMES.has(match[0].toLowerCase())) continue
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

  const scanShapeGated = (regex: RegExp, tokenGroup: number, allowPureDigits = false) => {
    regex.lastIndex = 0
    for (const match of normalized.matchAll(regex)) {
      const token = match[tokenGroup] ?? ''
      const cleaned = token.replace(/[.-]+$/, '').replace(/^@/, '')
      if (hasDistinctiveHandleShape(token)) {
        findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
      } else if (allowPureDigits && PURE_DIGITS_RE.test(cleaned) && cleaned.length >= 6) {
        findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
      }
    }
  }

  scanShapeGated(CN_OPEN_HANDLE_RE, 1, true)
  scanShapeGated(EN_OPEN_MY_RE, 1, false)
  scanShapeGated(EN_OPEN_INVITE_RE, 1, false)

  PLATFORM_COLON_OR_SPACE_RE.lastIndex = 0
  for (const match of normalized.matchAll(PLATFORM_COLON_OR_SPACE_RE)) {
    const hasColon = Boolean(match[1])
    const token = match[2] ?? ''
    const cleaned = token.replace(/[.-]+$/, '').replace(/^@/, '')
    if (hasDistinctiveHandleShape(token)) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    } else if (hasColon && PURE_DIGITS_RE.test(cleaned) && cleaned.length >= 6) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  for (const alphaRe of [CN_WECHAT_ALPHA_RE, STRONG_IM_COLON_ALPHA_RE]) {
    alphaRe.lastIndex = 0
    for (const match of normalized.matchAll(alphaRe)) {
      const end = (match.index ?? 0) + match[0].length
      if (!isFollowedByProseOrTopic(normalized, end)) {
        findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
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
