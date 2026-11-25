export interface PiiFinding {
  category: 'email' | 'phone' | 'url' | 'china_id' | 'social_handle'
  excerpt: string
}

const ZERO_WIDTH_RE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/g

const TECH_NON_URL_NAMES = new Set(['asp.net', 'vb.net', 'ado.net', 'paint.net'])

const PLAIN_MEDIA_WORDS = new Set([
  'vlog',
  'vlogs',
  'blog',
  'live',
  'feed',
  'post',
  'posts',
  'chat',
  'chats',
  'reel',
  'reels',
  'story',
  'stories',
  'video',
  'videos',
  'music',
  'audio',
  'photo',
  'photos',
  'note',
  'notes',
  'meme',
  'memes',
  'vibe',
  'vibes',
  'news',
  'mode',
  'dark',
  'light',
  'plus',
  'beta',
  'mini',
  'never',
  'always',
  'rarely',
  'daily',
  'often',
  'sometimes',
  'seldom',
  'none',
  'true',
  'false',
  'yes',
])

const FOUR_DIGIT_YEAR_RE = /^(?:19|20)\d{2}$/

function isRealHandleCandidate(token: string, requireDistinctiveShape: boolean): boolean {
  const cleaned = token.replace(/^@/, '')
  if (cleaned.length < 3) return false
  if (FOUR_DIGIT_YEAR_RE.test(cleaned)) return false
  if (PLAIN_MEDIA_WORDS.has(cleaned.toLowerCase())) return false
  if (token.startsWith('@')) return true
  if (requireDistinctiveShape) {
    return /[_.\d]/.test(cleaned)
  }
  return true
}

const DIRECT_PATTERNS: ReadonlyArray<{ category: PiiFinding['category']; pattern: RegExp }> = [
  { category: 'email', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { category: 'url', pattern: /https?:\/\/[^\s]+/gi },
  {
    category: 'china_id',
    pattern: /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
  },
  {
    category: 'phone',
    pattern: /(?<!\d)(?:\+?86[\s.-]?)?1[3-9]\d[\s.-]?\d{4}[\s.-]?\d{4}(?!\d)/g,
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
    pattern: /(?:\bqq|扣扣)\s*(?:(?:账|帐)?号|ID)?\s*(?:是|为)?\s*[:：=]?\s*[1-9]\d{4,11}\b/gi,
  },
]

const BARE_URL_RE =
  /\b(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|cn|net|org|io|dev|app|ai|me|co|gg|tv|cc|xyz|site|link|live|im|uk|jp|de|fr|edu|gov)(?:\/[^\s]*|\b)/gi

const EXPLICIT_CN_HANDLE_RE =
  /(?:(?:加\s*(?:我\s*)?(?:[vV微]|微信|小红书|抖音|快手|微博|企鹅))|(?:(?:微信|小红书|抖音|快手|微博|企鹅)\s*(?:(?:账|帐)?号|ID)))\s*(?:是|为)?\s*[:：=]?\s*(@?[A-Za-z0-9_.-]{4,})/gi

const PLATFORM_CN_HANDLE_RE =
  /(?:微信|小红书|抖音|快手|微博|企鹅)\s*(?:是|为)?\s*(?:([:：=])\s*|\s+|(?=[A-Za-z0-9_.-]))(@?[A-Za-z0-9_.-]{4,})/gi

const EXPLICIT_EN_HANDLE_RE =
  /\b(?:wx|vx|weixin|xhs|tg)\b\s*(?:id|handle|account)?\s*(?:is)?\s*(?:[:：=]\s*|\s+)(@?[A-Za-z0-9_.-]{3,})/gi

const PLATFORM_EN_EXPLICIT_CUE_RE =
  /\b(?:wechat|telegram|ins|ig|instagram|twitter|discord|whatsapp|snapchat|line|signal)\b\s+(?:id|handle|account)\s*(?:is)?\s*(?:[:：=]\s*|\s+)(@?[A-Za-z0-9_.-]{3,})/gi

const PLATFORM_EN_COLON_RE =
  /\b(?:wechat|telegram|ins|ig|instagram|twitter|discord|whatsapp|snapchat)\b\s*[:：=]\s*(@?[A-Za-z0-9_.-]{3,})/gi

const PLATFORM_EN_SPACE_RE =
  /\b(?:wechat|telegram|ins|ig|instagram|twitter|discord|whatsapp|snapchat)\b\s+(@?[A-Za-z0-9_.-]{3,})/gi

export function scanPii(text: string): { clean: boolean; findings: PiiFinding[] } {
  const normalized = text.normalize('NFKC').replace(ZERO_WIDTH_RE, '')
  const findings: PiiFinding[] = []

  for (const { category, pattern } of DIRECT_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of normalized.matchAll(pattern)) {
      findings.push({ category, excerpt: match[0].slice(0, 32) })
    }
  }

  BARE_URL_RE.lastIndex = 0
  for (const match of normalized.matchAll(BARE_URL_RE)) {
    const raw = match[0]
    if (TECH_NON_URL_NAMES.has(raw.toLowerCase())) continue
    findings.push({ category: 'url', excerpt: raw.slice(0, 32) })
  }

  EXPLICIT_CN_HANDLE_RE.lastIndex = 0
  for (const match of normalized.matchAll(EXPLICIT_CN_HANDLE_RE)) {
    const candidate = match[1] ?? ''
    if (isRealHandleCandidate(candidate, false)) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  PLATFORM_CN_HANDLE_RE.lastIndex = 0
  for (const match of normalized.matchAll(PLATFORM_CN_HANDLE_RE)) {
    const hasColon = Boolean(match[1])
    const candidate = match[2] ?? ''
    if (isRealHandleCandidate(candidate, !hasColon)) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  EXPLICIT_EN_HANDLE_RE.lastIndex = 0
  for (const match of normalized.matchAll(EXPLICIT_EN_HANDLE_RE)) {
    const candidate = match[1] ?? ''
    if (isRealHandleCandidate(candidate, false)) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  PLATFORM_EN_EXPLICIT_CUE_RE.lastIndex = 0
  for (const match of normalized.matchAll(PLATFORM_EN_EXPLICIT_CUE_RE)) {
    const candidate = match[1] ?? ''
    if (isRealHandleCandidate(candidate, false)) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  PLATFORM_EN_COLON_RE.lastIndex = 0
  for (const match of normalized.matchAll(PLATFORM_EN_COLON_RE)) {
    const candidate = match[1] ?? ''
    if (isRealHandleCandidate(candidate, true)) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  PLATFORM_EN_SPACE_RE.lastIndex = 0
  for (const match of normalized.matchAll(PLATFORM_EN_SPACE_RE)) {
    const candidate = match[1] ?? ''
    if (isRealHandleCandidate(candidate, true)) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
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
