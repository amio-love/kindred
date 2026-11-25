export interface PiiFinding {
  category: 'email' | 'phone' | 'url' | 'china_id' | 'social_handle'
  excerpt: string
}

const PII_PATTERNS: ReadonlyArray<{ category: PiiFinding['category']; pattern: RegExp }> = [
  { category: 'email', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { category: 'url', pattern: /https?:\/\/[^\s]+/gi },
  {
    category: 'url',
    pattern:
      /\b(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|cn|net|org|io|dev|app|ai|me|co|gg|tv|cc|xyz|site|link|live|im|uk|jp|de|fr|edu|gov)(?:\/[^\s]*|\b)/gi,
  },
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
    pattern: /(?<!\d)\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g,
  },
  {
    category: 'social_handle',
    pattern: /(?<![A-Za-z0-9._%+-])@[A-Za-z][A-Za-z0-9_.-]{2,31}\b/g,
  },
  {
    category: 'social_handle',
    pattern: /(?:\bqq|扣扣)\s*(?:号|账号|帐号|ID|是)?\s*[:：=]?\s*[1-9]\d{4,11}\b/gi,
  },
  {
    category: 'social_handle',
    pattern:
      /(?:微信|小红书|抖音|快手|微博|企鹅)\s*(?:号|账号|帐号|ID|是)?(?:\s*[:：=]\s*|\s+)[@A-Za-z0-9_.-]{4,}/gi,
  },
  {
    category: 'social_handle',
    pattern:
      /(?:微信|小红书|抖音|快手|微博|企鹅)(?:号|账号|帐号|ID|是)?(?=[@A-Za-z0-9_.-]*[A-Za-z_])[@A-Za-z0-9_.-]{4,}/gi,
  },
  {
    category: 'social_handle',
    pattern:
      /\b(?:wx|vx|wechat|tg|telegram|ins|ig|instagram|xhs|twitter|discord|whatsapp|snapchat)\b\s*(?:id|handle|account|is)?(?:\s*[:：=]\s*@?[A-Za-z0-9_.-]{3,}|\s+@[A-Za-z0-9_.-]{3,}|\s+(?=[A-Za-z0-9_.-]*[0-9_])[A-Za-z0-9_.-]{3,})/gi,
  },
  {
    category: 'social_handle',
    pattern:
      /\b(?:line|signal)\b(?:\s+(?:id|handle|account)\s*(?:[:：=]\s*|\s+)@?[A-Za-z0-9_.-]{3,}|(?:\s*[:：=]\s*|\s+)@[A-Za-z0-9_.-]{3,})/gi,
  },
]

export function scanPii(text: string): { clean: boolean; findings: PiiFinding[] } {
  const normalized = text.normalize('NFKC')
  const findings: PiiFinding[] = []
  for (const { category, pattern } of PII_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of normalized.matchAll(pattern)) {
      findings.push({ category, excerpt: match[0].slice(0, 32) })
    }
  }
  return { clean: findings.length === 0, findings }
}
