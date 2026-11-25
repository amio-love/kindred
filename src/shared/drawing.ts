import type { Stroke } from './types'

export const CANVAS_SIZE = 400
export const MAX_STROKES = 60
export const MAX_POINTS_PER_STROKE = 120
export const MAX_GUESS_ATTEMPTS = 3

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export const DRAW_PROMPT_POOL: readonly string[] = [
  '戴墨镜的猫',
  '把手机扔出卧室',
  '凌晨两点的便利店',
  '外星人吃火锅',
  '不想上班的闹钟',
  '雨天打伞的机器人',
  '看洗发水成分表',
  '宇宙拉面摊',
  '骑自行车的柴犬',
  '在月球上喝奶茶',
  '长翅膀的咖啡杯',
  '偷吃饼干的小恐龙',
  '晒太阳的仙人掌',
  '会飞的沙发',
  '在浴缸里钓鱼',
  '打哈欠的火山',
]

export function validateStrokes(raw: unknown): { ok: true; strokes: Stroke[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'strokes must be an array' }
  }
  if (raw.length === 0) {
    return { ok: false, error: 'at least one stroke is required' }
  }
  if (raw.length > MAX_STROKES) {
    return { ok: false, error: `at most ${MAX_STROKES} strokes are allowed` }
  }

  const strokes: Stroke[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `stroke[${i}] must be an object` }
    }
    const candidate = item as Record<string, unknown>
    const color =
      typeof candidate.color === 'string' && HEX_COLOR_RE.test(candidate.color)
        ? candidate.color
        : '#1F1D1A'
    const widthNum = Number(candidate.width)
    const width = Number.isFinite(widthNum) ? Math.min(24, Math.max(1, Math.round(widthNum))) : 4

    if (!Array.isArray(candidate.points) || candidate.points.length < 2) {
      return { ok: false, error: `stroke[${i}].points must contain at least 2 points` }
    }
    if (candidate.points.length > MAX_POINTS_PER_STROKE) {
      return { ok: false, error: `stroke[${i}].points exceeds ${MAX_POINTS_PER_STROKE} points` }
    }

    const points: [number, number][] = []
    for (let j = 0; j < candidate.points.length; j++) {
      const pt = candidate.points[j]
      if (!Array.isArray(pt) || pt.length !== 2) {
        return { ok: false, error: `stroke[${i}].points[${j}] must be [x, y]` }
      }
      const x = Number(pt[0])
      const y = Number(pt[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { ok: false, error: `stroke[${i}].points[${j}] has non-finite coordinates` }
      }
      points.push([
        Math.round(Math.min(CANVAS_SIZE, Math.max(0, x)) * 10) / 10,
        Math.round(Math.min(CANVAS_SIZE, Math.max(0, y)) * 10) / 10,
      ])
    }
    strokes.push({ color, width, points })
  }

  return { ok: true, strokes }
}

export function strokesToStaticSvg(strokes: readonly Stroke[]): string {
  const polylines = strokes
    .map((stroke) => {
      const pts = stroke.points.map(([x, y]) => `${x},${y}`).join(' ')
      return `<polyline fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round" points="${pts}" />`
    })
    .join('')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}">`,
    `<rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" rx="16" fill="#FCFAF5" />`,
    polylines,
    `</svg>`,
  ].join('')
}

export function normalizeGuess(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s，。！？,.!?:：'"“”‘’\-_]+/g, '')
}

export function isCorrectGuess(secretWord: string, guess: string): boolean {
  const target = normalizeGuess(secretWord)
  const input = normalizeGuess(guess)
  if (!target || !input) return false
  return (
    target === input ||
    (input.length >= 2 && target.includes(input) && input.length >= Math.ceil(target.length * 0.7))
  )
}

export function pickRoundPrompts(usedWords: readonly string[], seedIndex: number): string[] {
  const used = new Set(usedWords)
  const available = DRAW_PROMPT_POOL.filter((word) => !used.has(word))
  const pool = available.length >= 3 ? available : [...DRAW_PROMPT_POOL]
  const picked: string[] = []
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = (seedIndex * 5 + i * 3) % pool.length
    picked.push(pool.splice(idx, 1)[0]!)
  }
  return picked
}
