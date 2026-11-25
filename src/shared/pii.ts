export interface PiiFinding {
  category: 'email' | 'phone' | 'url' | 'china_id' | 'social_handle'
  excerpt: string
}

const PII_PATTERNS: ReadonlyArray<{ category: PiiFinding['category']; pattern: RegExp }> = [
  { category: 'email', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { category: 'url', pattern: /https?:\/\/[^\s]+/gi },
  { category: 'china_id', pattern: /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g },
  { category: 'phone', pattern: /(?:\+?\d{1,3}[\s-]?)?(?:1[3-9]\d{9}|\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})/g },
  { category: 'social_handle', pattern: /(?:微信|vx|wechat|tg|telegram|ins|instagram|小红书号|抖音号)\s*[:：]?\s*[A-Za-z0-9_.-]{4,}/gi },
]

export function scanPii(text: string): { clean: boolean; findings: PiiFinding[] } {
  const findings: PiiFinding[] = []
  for (const { category, pattern } of PII_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      findings.push({ category, excerpt: match[0].slice(0, 32) })
    }
  }
  return { clean: findings.length === 0, findings }
}
