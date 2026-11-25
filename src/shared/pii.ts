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
const SEMVER_RE = /^(?:v|vol)\.?\d+(?:\.\d+)*$/i
const PRODUCT_MODEL_RE =
  /^(?:(?:iphone|ipad|ios|macos|macbook|watchos|pixel|galaxy|redmi|mi|mate|nova|ps|xbox|switch|gpt|claude|qwen|llama|gemini|grok|sora|python|node|react|vue|dota|cs|gta|halo|web|http)[-.]?\d{1,2}(?:\.\d+)*[a-z]?|(?:rtx|gtx)[-.]?\d{3,4}(?:ti|super)?|es(?:6|20\d{2})|deepseek[-.]?(?:r|v)\d+(?:\.\d+)*|a\d+m\d+|h26[45]|m[1-9](?:pro|max|ultra))$/i

function isDistinctiveHandle(token: string): boolean {
  if (token.length < 3 || token.length > 32) return false
  if (!/^[A-Za-z]/.test(token)) return false
  if (RANKING_RE.test(token)) return false
  if (SEMVER_RE.test(token)) return false
  if (PRODUCT_MODEL_RE.test(token)) return false
  if (TECH_NON_URL_NAMES.has(token.toLowerCase())) return false
  const dotParts = token.split('.')
  if (dotParts.length === 2) {
    if (HONORIFICS.has(dotParts[0]!.toLowerCase())) return false
    if (CODE_OR_FILE_EXTS.has(dotParts[1]!.toLowerCase())) return false
  }
  if (token.includes('_') || token.includes('.')) return true
  return token.length >= 4 && /\d/.test(token)
}

const WRAP = '[\\s:：=，,（(\\[「『【"\'“”‘’`*~《→👉]*'
const EXPLICIT_DELIM = '[:：=，,（(\\[「『【"\'“”‘’`*~《→👉]'

const DIRECT_PATTERNS: ReadonlyArray<{ category: PiiFinding['category']; pattern: RegExp }> = [
  { category: 'email', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  {
    category: 'email',
    pattern:
      /[A-Z0-9._%+-]+\s*[\[(]\s*at\s*[\])]\s*[A-Z0-9.-]+(?:\.|\s*[\[(]\s*dot\s*[\])]\s*)[A-Z]{2,}/gi,
  },
  { category: 'url', pattern: /https?:\/\/[^\s]+/gi },
  {
    category: 'url',
    pattern: /\bwww\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,24})+(?:\/[^\s]*)?/gi,
  },
  {
    category: 'url',
    pattern:
      /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:substack\.com|github\.io|carrd\.co|tumblr\.com|notion\.site|blogspot\.com|wordpress\.com|medium\.com|itch\.io|bandcamp\.com|wixsite\.com|vercel\.app|pages\.dev|netlify\.app)\b/gi,
  },
  {
    category: 'url',
    pattern: new RegExp(
      `(?:(?:我的|个人)?(?:主页|站点|网站|博客|官网)|\\b(?:my\\s+)?(?:site|website|blog|homepage|portfolio)\\s*(?:is\\b|[:：=])?)\\s*${WRAP}[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.(?:com|net|org|io|me|dev|co|app|site|xyz|cc|cn|im|blog|studio)\\b`,
      'gi',
    ),
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
    category: 'phone',
    pattern:
      /(?:\b(?:call|text|phone|tel|sms|whatsapp|signal|cell|mobile)\s*(?:me\s*)?(?:at\s*)?[:：=]?\s*|电话\s*[:：=]?\s*)(?<!\d)[2-9]\d{2}[2-9]\d{6}(?!\d)/gi,
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
    pattern: new RegExp(
      `(?:\\bqq|扣扣|加\\s*q|\\bq\\s*群|\\bq\\s*号)\\s*(?:群|(?:账|帐)?号(?:码)?|ID)?\\s*(?:是|为|叫)?\\s*${WRAP}[1-9]\\d{4,11}\\b`,
      'gi',
    ),
  },
]

const PATH_URL_RE =
  /\b([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)\.([a-z]{2,12})\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/g

const SPACED_NANP_RE = /(?<!\d)([2-9]\d{2})\s+([2-9]\d{2})\s+(\d{4})(?!\d)/g

const TOKEN_RE = /[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?/g

const CN_DM_PLATS = '(?:[vV微]信|微信|企鹅)'
const CN_DM_ALIAS = '(?:(?<![A-Za-z])(?:wx|vx|weixin))'
const CN_CONTENT_PLATS =
  '(?:小红书|抖音|快手|微博|推特|B站|b站|哔哩哔哩|知乎|豆瓣|贴吧|闲鱼|咸鱼)'
const EN_DM_PLATS =
  '(?:wx|vx|weixin|wechat|telegram|tg|ins|ig|insta|instagram|twitter|xhs|discord|whatsapp|snapchat|snap|line|signal|tiktok|facebook|fb|linkedin|threads|bluesky|mastodon|skype|kakao|viber|clubhouse|venmo|paypal|cashapp)'
const EN_CONTENT_PLATS =
  '(?:steam|twitch|psn|xbox|battlenet|bnet|github|reddit|substack|medium|youtube|spotify|goodreads|letterboxd|strava)'
const EN_ALL_PLATS = `(?:${EN_DM_PLATS}|${EN_CONTENT_PLATS})`

const SHAPE_CUE_PATTERNS: readonly RegExp[] = [
  new RegExp(
    `(?:我(?:的)?|本人)\\s*(?:(?:${CN_DM_PLATS}|${CN_CONTENT_PLATS}|${EN_ALL_PLATS}|[vVxX])\\s*(?:(?:账|帐)?号(?:码)?|用户名|ID|名|同号)?|(?:(?:账|帐)?号(?:码)?|用户名|ID|名))\\s*(?:是|为|叫)?\\s*${WRAP}$`,
    'i',
  ),
  new RegExp(
    `(?:(?:账|帐)号(?:码)?|用户名)\\s*(?:是|为|叫|${EXPLICIT_DELIM})\\s*${WRAP}$`,
    'i',
  ),
  new RegExp(
    `(?:(?:加\\s*(?:我\\s*|个\\s*|一下\\s*)?(?:[vV微]|${CN_DM_PLATS}|${CN_CONTENT_PLATS}|${EN_ALL_PLATS})|(?<![A-Za-z0-9])\\+\\s*(?:[vV微]|${CN_DM_PLATS}|${CN_DM_ALIAS}))\\s*(?:(?:账|帐)?号(?:码)?|ID|名)?\\s*(?:吧|呀|哈|聊)?\\s*${WRAP}|(?:加我|关注我|私信我|联系我|找我|滴滴我|dd我)\\s*${EXPLICIT_DELIM}${WRAP})$`,
    'i',
  ),
  new RegExp(
    `(?:(?:${CN_DM_PLATS}|${CN_DM_ALIAS})\\s*(?:搜(?:索)?|(?:(?:账|帐)?号(?:码)?|ID|名|同号)\\s*(?:是|为|叫)?|是|为|叫)?|(?:${CN_CONTENT_PLATS})\\s*(?:搜(?:索)?|(?:(?:账|帐)?号(?:码)?|ID|名|同号)\\s*(?:是|为|叫)?|是|为|叫|[:：=]))\\s*${WRAP}$`,
    'i',
  ),
  new RegExp(`(?<![A-Za-z])[vVxX]\\s*[:：=]\\s*${WRAP}$`),
  new RegExp(
    `\\b${EN_DM_PLATS}\\s*(?:(?:id|handle|account|username|name)\\s*)?(?:is\\b|[:：=]|\\s)\\s*${WRAP}$`,
    'i',
  ),
  new RegExp(
    `\\b${EN_CONTENT_PLATS}\\s*(?:(?:id|handle|account|username|name)\\s*(?:is\\b|[:：=]|\\s)|[:：=])\\s*${WRAP}$`,
    'i',
  ),
  new RegExp(`\\b(?:username|handle)\\s*[:：=]\\s*${WRAP}$`, 'i'),
  new RegExp(
    `\\bmy\\s+(?:(?:${EN_DM_PLATS}|[vVxX])(?:\\s+(?:id|handle|account|username|name))?|(?:id|handle|username|account)|(?:${EN_CONTENT_PLATS}|[A-Za-z][A-Za-z0-9_-]{1,18})\\s+(?:id|handle|account|username|name))\\s*(?:is\\b|[:：=])\\s*${WRAP}$`,
    'i',
  ),
  new RegExp(
    `\\b(?:(?:find|add|dm|message|reach|contact|follow|text|ping)\\s+me(?:\\s+(?:(?:on|at)\\s+[A-Za-z0-9_.-]+(?:\\s+(?:as|at)\\b|\\s*[:：=]|\\s+)|(?:as|at|on)\\b))?|hmu(?:\\s+(?:on|at)\\s+[A-Za-z0-9_.-]+)?)\\s*${WRAP}$`,
    'i',
  ),
]

const MY_CONTENT_PLAT_RE = new RegExp(
  `\\bmy\\s+${EN_CONTENT_PLATS}\\s*(?:is\\b|[:：=])\\s*${WRAP}$`,
  'i',
)

const TRAILING_BEFORE_RE = new RegExp(
  `\\b(?:i\\s+am|i'm|im|call\\s+me|find|add|dm|follow|reach|contact|message|search|check|it's|its)\\s*${WRAP}$`,
  'i',
)
const TRAILING_AFTER_RE = new RegExp(
  `^['"”’」』）)\\]\`*]*\\s+on\\s+(?:${EN_ALL_PLATS}|[vVxX])\\b`,
  'i',
)

const PURE_ALPHA_EXPLICIT_CUES: readonly RegExp[] = [
  new RegExp(
    `(?:(?:我(?:的)?|本人)\\s*(?:微信|[vV]信|${CN_DM_ALIAS})\\s*(?:(?:账|帐)?号(?:码)?|ID|名)?\\s*(?:是|为|叫|[:：=])|(?:加\\s*(?:我|个|一下)?|(?<![A-Za-z0-9])\\+)[ \\t]*(?:[vV微]|微信|[vV]信|${CN_DM_ALIAS})\\s*(?:(?:账|帐)?号(?:码)?|ID)?\\s*(?:吧|呀|哈|聊)?|(?:微信|[vV]信|${CN_DM_ALIAS}|${CN_CONTENT_PLATS})\\s*(?:(?:账|帐)?号(?:码)?|ID|名|同号)\\s*(?:是|为|叫)?)\\s*${WRAP}$`,
    'i',
  ),
  new RegExp(
    `\\b(?:my\\s+)?(?:${EN_ALL_PLATS}|[vVxX])\\s+(?:id|handle|username|name)\\s*(?:is\\b|[:：=])\\s*${WRAP}$`,
    'i',
  ),
  new RegExp(`\\bmy\\s+(?:wechat|weixin|wx|vx)\\s*[:：=]\\s*${WRAP}$`, 'i'),
  new RegExp(
    `\\b(?:find|add|dm|message|reach|contact|follow|text)\\s+me\\s+on\\s+(?:${EN_ALL_PLATS}|[vVxX])\\s*(?:as\\b|[:：=])\\s*${WRAP}$`,
    'i',
  ),
]

const PURE_DIGIT_EXPLICIT_CUE_RE = new RegExp(
  `(?:${CN_DM_PLATS}|${CN_CONTENT_PLATS}|\\b${EN_ALL_PLATS})\\s*(?:(?:账|帐)?号(?:码)?|ID)\\s*(?:是|为|叫)?\\s*${WRAP}$`,
  'i',
)

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
    const before = normalized.slice(Math.max(0, start - 48), start)
    const after = normalized.slice(end, end + 32)

    if (isDistinctiveHandle(tok)) {
      if (
        hasCueBefore(before, SHAPE_CUE_PATTERNS) ||
        ((tok.includes('_') || tok.includes('.')) && MY_CONTENT_PLAT_RE.test(before)) ||
        (TRAILING_BEFORE_RE.test(before) && TRAILING_AFTER_RE.test(after))
      ) {
        findings.push({ category: 'social_handle', excerpt: tok.slice(0, 32) })
      }
    } else if (PURE_ALPHA_OR_HYPHEN_RE.test(tok)) {
      if (hasCueBefore(before, PURE_ALPHA_EXPLICIT_CUES)) {
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
