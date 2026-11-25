export interface PiiFinding {
  category: 'email' | 'phone' | 'url' | 'china_id' | 'social_handle'
  excerpt: string
}

const ZERO_WIDTH_RE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/g

const TECH_NON_URL_NAMES = new Set(['asp.net', 'vb.net', 'ado.net', 'paint.net'])

const NON_HANDLE_WORDS = new Set([
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
  'no',
  'ootd',
  'bgm',
  'cos',
  'diy',
  'asmr',
  'private',
  'public',
  'recipes',
  'recipe',
  'yet',
  'only',
  'here',
  'there',
  'more',
  'less',
  'good',
  'bad',
  'great',
  'nice',
  'cool',
  'weak',
  'strong',
])

const FOUR_DIGIT_YEAR_RE = /^(?:19|20)\d{2}$/
const RESOLUTION_RE = /^\d{3,4}[pPkK]$/
const PURE_DIGITS_RE = /^\d+$/

function hasDistinctiveHandleShape(cleaned: string): boolean {
  if (RESOLUTION_RE.test(cleaned)) return false
  if (PURE_DIGITS_RE.test(cleaned)) return false
  if (/[_.]/.test(cleaned)) return true
  return /[A-Za-z]/.test(cleaned) && /\d/.test(cleaned)
}

function isRealHandleCandidate(
  token: string,
  mode: 'explicit_cue' | 'colon_platform' | 'bare_space',
): boolean {
  const trimmed = token.replace(/[.-]+$/, '')
  const cleaned = trimmed.replace(/^@/, '')
  if (cleaned.length < 3) return false
  if (FOUR_DIGIT_YEAR_RE.test(cleaned)) return false
  if (RESOLUTION_RE.test(cleaned)) return false
  if (trimmed.startsWith('@')) return true
  if (NON_HANDLE_WORDS.has(cleaned.toLowerCase())) return false

  if (mode === 'bare_space') {
    return hasDistinctiveHandleShape(cleaned)
  }

  if (mode === 'colon_platform') {
    if (PURE_DIGITS_RE.test(cleaned)) {
      return cleaned.length >= 6
    }
    return hasDistinctiveHandleShape(cleaned) || cleaned.length >= 5
  }

  if (PURE_DIGITS_RE.test(cleaned)) {
    return cleaned.length >= 5
  }
  return true
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
    pattern: /(?<!\d)(?:\(0(?:10|2\d|[3-9]\d{2})\)\s*|0(?:10|2\d|[3-9]\d{2})-)[2-9]\d{6,7}(?!\d)/g,
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
    pattern: /(?:\bqq|扣扣)\s*(?:(?:账|帐)?号|ID)?\s*(?:是|为)?\s*[:：=]?\s*[1-9]\d{4,11}\b/gi,
  },
]

const SPACED_NANP_RE = /(?<!\d)([2-9]\d{2})\s+([2-9]\d{2})\s+(\d{4})(?!\d)/g

const BARE_URL_RE =
  /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|cn|net|org|io|dev|app|ai|me|co|gg|tv|cc|xyz|site|link|live|im|uk|jp|de|fr|edu|gov|club|top|vip|shop|fun|tech|online|blog|page|bio|social|chat|work|studio|design|space|cloud|world|pro|info|biz)(?:\/[^\s]*|\b)/gi

const CN_PLATS = '(?:微信|小红书|抖音|快手|微博|企鹅|B站|b站|哔哩哔哩|知乎|豆瓣|贴吧)'

const EXPLICIT_CN_HANDLE_RE = new RegExp(
  `(?:(?:加\\s*(?:我\\s*|个\\s*|一下\\s*)?(?:[vV微]|${CN_PLATS})\\s*(?:吧|呀|哈|聊)?)|(?:${CN_PLATS}\\s*(?:(?:账|帐)?号|ID|名)))\\s*(?:是|为)?\\s*(?:[:：=]\\s*|\\s+|(?=[@A-Za-z0-9_.-]))(@?[A-Za-z0-9_.-]{4,})`,
  'gi',
)

const COLON_CN_HANDLE_RE = new RegExp(
  `${CN_PLATS}\\s*(?:是|为)?\\s*[:：=]\\s*(@?[A-Za-z0-9_.-]{3,})`,
  'gi',
)

const BARE_CN_HANDLE_RE = new RegExp(
  `${CN_PLATS}(?:\\s+|(?=[@A-Za-z0-9_.-]))(@?[A-Za-z0-9_.-]{4,})`,
  'gi',
)

const EN_SHORT_PLATS = '(?:wx|vx|weixin|xhs|tg)'
const EN_FULL_PLATS =
  '(?:wechat|telegram|ins|ig|insta|instagram|twitter|discord|whatsapp|snapchat|tiktok|github|reddit)'
const EN_AMBIG_PLATS = '(?:line|signal)'

const EXPLICIT_EN_ASSIGN_RE = new RegExp(
  `\\b(?:my\\s+(?:${EN_SHORT_PLATS}|${EN_FULL_PLATS}|${EN_AMBIG_PLATS})(?:\\s+(?:id|handle|account))?\\s+(?:is\\s+|[:：=]\\s*)|(?:${EN_SHORT_PLATS}|${EN_FULL_PLATS}|${EN_AMBIG_PLATS})\\s+(?:id|handle|account)\\s*(?:is\\s+|[:：=]\\s*))(@?[A-Za-z0-9_.-]{3,})`,
  'gi',
)

const EN_SHORT_COLON_OR_SPACE_RE = new RegExp(
  `\\b${EN_SHORT_PLATS}\\b\\s*(?:([:：=])\\s*|\\s+)(@?[A-Za-z0-9_.-]{3,})`,
  'gi',
)

const EN_FULL_COLON_RE = new RegExp(
  `\\b${EN_FULL_PLATS}\\b\\s*[:：=]\\s*(@?[A-Za-z0-9_.-]{3,})`,
  'gi',
)

const EN_AMBIG_COLON_RE = new RegExp(
  `\\b${EN_AMBIG_PLATS}\\b\\s*(?:(?:id|handle|account)\\s*)?[:：=]\\s*(@?[A-Za-z0-9_.-]{3,})`,
  'gi',
)

const EN_AMBIG_ID_SPACE_RE = new RegExp(
  `\\b${EN_AMBIG_PLATS}\\b\\s+(?:id|handle|account)\\s+(@?[A-Za-z0-9_.-]{3,})`,
  'gi',
)

const EN_FULL_SPACE_RE = new RegExp(
  `\\b${EN_FULL_PLATS}\\b\\s+(@?[A-Za-z0-9_.-]{3,})`,
  'gi',
)

export function scanPii(text: string): { clean: boolean; findings: PiiFinding[] } {
  const normalized = text.normalize('NFKC').replace(ZERO_WIDTH_RE, '')
  const findings: PiiFinding[] = []

  for (const { category, pattern } of DIRECT_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of normalized.matchAll(pattern)) {
      findings.push({ category, excerpt: match[0].slice(0, 32) })
    }
  }

  SPACED_NANP_RE.lastIndex = 0
  for (const match of normalized.matchAll(SPACED_NANP_RE)) {
    const a = Number(match[1])
    const b = Number(match[2])
    const c = Number(match[3])
    if (a % 100 === 0 && b % 100 === 0 && c % 100 === 0) continue
    findings.push({ category: 'phone', excerpt: match[0].slice(0, 32) })
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
    if (isRealHandleCandidate(candidate, 'explicit_cue')) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  COLON_CN_HANDLE_RE.lastIndex = 0
  for (const match of normalized.matchAll(COLON_CN_HANDLE_RE)) {
    const candidate = match[1] ?? ''
    if (isRealHandleCandidate(candidate, 'colon_platform')) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  BARE_CN_HANDLE_RE.lastIndex = 0
  for (const match of normalized.matchAll(BARE_CN_HANDLE_RE)) {
    const candidate = match[1] ?? ''
    if (isRealHandleCandidate(candidate, 'bare_space')) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  EXPLICIT_EN_ASSIGN_RE.lastIndex = 0
  for (const match of normalized.matchAll(EXPLICIT_EN_ASSIGN_RE)) {
    const candidate = match[1] ?? ''
    if (isRealHandleCandidate(candidate, 'explicit_cue')) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  EN_SHORT_COLON_OR_SPACE_RE.lastIndex = 0
  for (const match of normalized.matchAll(EN_SHORT_COLON_OR_SPACE_RE)) {
    const hasColon = Boolean(match[1])
    const candidate = match[2] ?? ''
    if (isRealHandleCandidate(candidate, hasColon ? 'colon_platform' : 'bare_space')) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  EN_FULL_COLON_RE.lastIndex = 0
  for (const match of normalized.matchAll(EN_FULL_COLON_RE)) {
    const candidate = match[1] ?? ''
    if (isRealHandleCandidate(candidate, 'colon_platform')) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  EN_AMBIG_COLON_RE.lastIndex = 0
  for (const match of normalized.matchAll(EN_AMBIG_COLON_RE)) {
    const candidate = match[1] ?? ''
    if (isRealHandleCandidate(candidate, 'bare_space')) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  EN_AMBIG_ID_SPACE_RE.lastIndex = 0
  for (const match of normalized.matchAll(EN_AMBIG_ID_SPACE_RE)) {
    const candidate = match[1] ?? ''
    if (isRealHandleCandidate(candidate, 'bare_space')) {
      findings.push({ category: 'social_handle', excerpt: match[0].slice(0, 32) })
    }
  }

  EN_FULL_SPACE_RE.lastIndex = 0
  for (const match of normalized.matchAll(EN_FULL_SPACE_RE)) {
    const candidate = match[1] ?? ''
    if (isRealHandleCandidate(candidate, 'bare_space')) {
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
