import { OPTION_KEYS } from './quiz'
import type { OptionKey, QuestionOptions, Stroke, SubtextPromptTemplate } from './types'

export const CANVAS_SIZE = 400
export const MAX_STROKES = 60
export const MAX_POINTS_PER_STROKE = 120
export const MAX_GUESS_ATTEMPTS = 3

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export const SUBTEXT_PROMPT_POOL: readonly SubtextPromptTemplate[] = [
  {
    subtext: '舍不得今天结束的报复性熬夜',
    visualHint: '深夜亮屏电脑上堆成高塔的空白标签页、没喝的茶、无数字表盘与窗外困倦月亮',
    surfaceDecoys: ['半夜还在赶方案加班', '忘了关电脑就睡着了', '晚上喝太多茶失眠了'],
  },
  {
    subtext: '湘北平交道的那个夏天',
    visualHint: '落日海边铁路平交道黄黑栏杆、驶过的绿白电车、路面旁孤零零的篮球与书包',
    surfaceDecoys: ['放学后等电车回家', '周末去海边打球', '海滨小镇的铁道风景'],
  },
  {
    subtext: '社交电量归零，自动切回飞行模式',
    visualHint: '电梯角落戴耳机闭眼的人、头顶漂浮带星光的安静小云、远处两个聊天的虚影',
    surfaceDecoys: ['下班路上听歌放松', '担心外面突然下雨', '在电梯里忘了按楼层'],
  },
  {
    subtext: '周五五点五十八分的灵魂下班',
    visualHint: '黑屏工位、已拉好拉链挂在椅背上的双肩包、差两格指到整点的无字挂钟',
    surfaceDecoys: ['刚收拾好准备出差', '午休时间去吃午饭', '停电了无法继续办公'],
  },
  {
    subtext: '耳机戴着其实根本没按播放',
    visualHint: '咖啡馆窗边戴大耳机看窗外的人、手机屏幕静止的暂停符号与周围飘散的对话波纹',
    surfaceDecoys: ['耳机突然没电关机了', '沉浸在喜欢的播客里', '在等朋友过来拼桌'],
  },
  {
    subtext: '收藏夹里永远不会点开的「以后再看」',
    visualHint: '一只塞满发光书签却盖满薄灰的玻璃罐、旁边还不断有新纸条飞进去',
    surfaceDecoys: ['整理旧书桌的断舍离', '准备考前复习的笔记堆', '收集邮票与明信片的爱好'],
  },
  {
    subtext: '嘴上说马上出门其实刚睁眼',
    visualHint: '凌乱被窝里伸出一只举着手机的手、床头一只穿了一半的袜子与空荡门廊',
    surfaceDecoys: ['周末赖床不想吃早饭', '清晨收到远方朋友的消息', '家里暖气太足让人犯困'],
  },
  {
    subtext: '雨夜便利店热关东煮的莫名治愈',
    visualHint: '玻璃窗外倾盆夜雨、窗内暖黄灯光下冒白气的小纸杯与孤单高脚凳',
    surfaceDecoys: ['忘带伞在路边商店避雨', '加班太晚随便垫一口肚子', '深夜值班店员的日常'],
  },
  {
    subtext: '为了凑满减买了一堆不需要的快乐',
    visualHint: '小推车里一个孤零零必需品旁边堆着五六个发光小摆件与彩带礼盒',
    surfaceDecoys: ['给朋友挑生日惊喜礼物', '搬进新家添置全套日用品', '周末超市大采购囤货'],
  },
  {
    subtext: '把「好的」改成「好哒」的求生欲',
    visualHint: '发出一朵微笑小花气泡的双手，背后藏着一只翻白眼瘫在椅子上的小猫影子',
    surfaceDecoys: ['收到升职加薪的好消息', '和最好的闺蜜闲聊日常', '在宠物店挑一只可爱小猫'],
  },
  {
    subtext: '看完好电影舍不得离场的片尾字幕',
    visualHint: '空无一人的漆黑影厅里唯一亮着微光的座椅与缓缓向上滚动的星光长带',
    surfaceDecoys: ['看电影中途睡过头没醒', '等人散完再去洗手间', '找不到掉在座下的钥匙'],
  },
  {
    subtext: '明明很困却非要把这一集看完的倔强',
    visualHint: '两根火柴撑起沉重眼皮的剪影与沙发对面散发出彩虹光束的屏幕',
    surfaceDecoys: ['熬夜看一场关键球赛直播', '调试客厅新买的投影仪', '害怕关灯后房间太安静'],
  },
]

export const SUBTEXT_PROMPT_POOL_EN: readonly SubtextPromptTemplate[] = [
  {
    subtext: 'Revenge bedtime procrastination',
    visualHint: 'A glowing midnight laptop stacked high with blank tabs, untouched tea, numberless clock, sleepy moon outside',
    surfaceDecoys: ['Pulling an all-nighter for work', 'Forgot to shut down the laptop', 'Too much late-night caffeine'],
  },
  {
    subtext: 'That Slam Dunk coastal crossing',
    visualHint: 'Sunset ocean railway crossing barrier, green-and-cream coastal train, a basketball and schoolbag resting nearby',
    surfaceDecoys: ['Waiting for the evening train home', 'Weekend basketball by the beach', 'Quiet seaside railway scenery'],
  },
  {
    subtext: 'Social battery 0% — airplane mode',
    visualHint: 'Calm person wearing headphones with eyes closed under a starry cloud in an elevator corner while two figures chat nearby',
    surfaceDecoys: ['Unwinding with music on the commute', 'Worried about rain outside', 'Forgot to hit my floor button'],
  },
  {
    subtext: 'Friday 5:58 PM mental checkout',
    visualHint: 'Dark desk monitor, zipped backpack already slung over the chair, wall clock hands two ticks before the top of the hour',
    surfaceDecoys: ['Packing up for a business trip', 'Stepping out for a lunch break', 'Office power outage'],
  },
  {
    subtext: 'Headphones on with nothing playing',
    visualHint: 'Window-seat cafe listener wearing large headphones gazing out while phone screen shows a static pause symbol',
    surfaceDecoys: ['Headphone battery just died', 'Deep inside a favorite podcast', 'Waiting for a friend to arrive'],
  },
  {
    subtext: 'Bookmarks saved for "someday"',
    visualHint: 'Overflowing dusty glass jar packed with glowing bookmark ribbons while fresh notes keep floating in',
    surfaceDecoys: ['Decluttering an old study desk', 'Organizing exam revision notes', 'Collecting vintage postcards'],
  },
  {
    subtext: 'Texted "on my way" from under the duvet',
    visualHint: 'One hand raising a glowing phone out of tangled blankets beside a half-worn sock and empty hallway',
    surfaceDecoys: ['Sleeping in on a lazy Sunday', 'Reading morning messages in bed', 'Cozy winter heater weather'],
  },
  {
    subtext: 'Rainy-night convenience store comfort',
    visualHint: 'Pouring dark rain outside glass windows, warm yellow light over a steaming paper cup and lone stool inside',
    surfaceDecoys: ['Waiting out a sudden downpour', 'Grabbing quick food after overtime', 'Night-shift cashier routine'],
  },
  {
    subtext: 'Adding extras just for free shipping',
    visualHint: 'One tiny necessity in a shopping basket buried under five glowing trinkets and ribboned novelty boxes',
    surfaceDecoys: ['Picking birthday surprises for friends', 'Stocking up a brand-new apartment', 'Weekend grocery haul'],
  },
  {
    subtext: 'Softening "ok" into "sounds great!!"',
    visualHint: 'Hands sending a smiling flower speech bubble while casting the shadow of an eye-rolling slouched cat',
    surfaceDecoys: ['Celebrating a promotion email', 'Gossiping with a close friend', 'Adopting a cheerful kitten'],
  },
  {
    subtext: 'Staying through the end credits alone',
    visualHint: 'One faintly glowing seat in an empty dark theater watching a starry vertical ribbon drift upward',
    surfaceDecoys: ['Fell asleep halfway through the movie', 'Waiting for the aisle crowd to clear', 'Looking for dropped keys under seats'],
  },
  {
    subtext: 'Too sleepy yet refusing to pause now',
    visualHint: 'Silhouette propping heavy eyelids open with two matchsticks facing a sofa screen beaming rainbow light',
    surfaceDecoys: ['Watching a live championship game', 'Calibrating a living-room projector', 'Disliking a dark quiet room'],
  },
]

export const DRAW_PROMPT_POOL: readonly string[] = SUBTEXT_PROMPT_POOL.map((p) => p.subtext)

export function detectLocaleFromTexts(texts: readonly string[]): 'zh' | 'en' {
  const combined = texts.join(' ')
  if (!combined.trim()) return 'zh'
  return /[\u4e00-\u9fff]/.test(combined) ? 'zh' : 'en'
}

export function findSubtextTemplate(word: string): SubtextPromptTemplate | undefined {
  const normalized = normalizeGuess(word)
  return (
    SUBTEXT_PROMPT_POOL.find((item) => normalizeGuess(item.subtext) === normalized) ??
    SUBTEXT_PROMPT_POOL_EN.find((item) => normalizeGuess(item.subtext) === normalized)
  )
}

export function buildShuffledSubtextOptions(
  trueSubtext: string,
  surfaceDecoys: readonly [string, string, string],
  rng: () => number = Math.random,
): { options: QuestionOptions; correctOption: OptionKey } {
  const entries = [
    { text: trueSubtext, isCorrect: true },
    { text: surfaceDecoys[0], isCorrect: false },
    { text: surfaceDecoys[1], isCorrect: false },
    { text: surfaceDecoys[2], isCorrect: false },
  ]

  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = entries[i]!
    entries[i] = entries[j]!
    entries[j] = tmp
  }

  const options = {} as QuestionOptions
  let correctOption: OptionKey = 'A'
  OPTION_KEYS.forEach((key, idx) => {
    const entry = entries[idx]!
    options[key] = entry.text
    if (entry.isCorrect) correctOption = key
  })

  return { options, correctOption }
}

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
    .replace(/[\s，。！？,.!?:：'"“”‘’「」\-_]+/g, '')
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

export function pickRoundPrompts(
  usedWords: readonly string[],
  seedIndex: number,
  locale: 'zh' | 'en' = 'zh',
): SubtextPromptTemplate[] {
  const sourcePool = locale === 'en' ? SUBTEXT_PROMPT_POOL_EN : SUBTEXT_PROMPT_POOL
  const used = new Set(usedWords.map(normalizeGuess))
  const available = sourcePool.filter((item) => !used.has(normalizeGuess(item.subtext)))
  const pool = available.length >= 3 ? available : [...sourcePool]
  const picked: SubtextPromptTemplate[] = []
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = (seedIndex * 5 + i * 3) % pool.length
    picked.push(pool.splice(idx, 1)[0]!)
  }
  return picked
}
