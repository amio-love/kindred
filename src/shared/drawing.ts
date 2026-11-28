import { OPTION_KEYS } from './quiz'
import type { OptionKey, Stroke, SubtextOptions, SubtextPromptTemplate } from './types'

export const CANVAS_SIZE = 400
export const MAX_STROKES = 60
export const MAX_POINTS_PER_STROKE = 120
export const MAX_GUESS_ATTEMPTS = 3

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export const SUBTEXT_PROMPT_POOL: readonly SubtextPromptTemplate[] = [
  {
    visualHint: '深夜亮屏电脑上堆成高塔的空白标签页、没喝的茶、无数字表盘与窗外困倦月亮',
    readings: [
      '刚决定放下坚持很久的事，脑子反而空了',
      '舍不得今天结束，宁愿把深夜浪费在空白里',
      '凌晨两点突然想通一件事，决定天亮再算',
      '明知对方不会再回，还是把窗口留在角落',
    ],
  },
  {
    visualHint: '落日海边铁路平交道黄黑栏杆、驶过的绿白电车、金色海面与空旷安静的临海公路',
    readings: [
      '灌篮高手：电车开过去，湘北的夏天就结束了',
      '千与千寻：想坐上一趟只去不回的海上列车',
      '秒速五厘米：隔着一道铁轨，两个人越走越远',
      '海街日记：海风很咸，有你在的日常刚刚好',
    ],
  },
  {
    visualHint: '电梯角落戴耳机闭眼的人、头顶漂浮带星光的安静小云、远处两个聊天的虚影',
    readings: [
      '社交电量归零，在人群里一键切回飞行模式',
      '假装没听见熟人寒暄，靠耳机当隐身斗篷',
      '耳机里其实没放歌，只想借五分钟安静',
      '刚听完一首戳中心事的歌，暂时不想回现实',
    ],
  },
  {
    visualHint: '黑屏工位、已拉好拉链挂在椅背上的双肩包、差两格指到整点的无字挂钟',
    readings: [
      '周五差两分钟下班，魂其实已经漂去夜市了',
      '终于把最烫手的项目收尾，松一口气的留白',
      '其实还没想好去哪儿，但一秒也不想多留',
      '工位关灯的那刻，才觉得这一天归自己了',
    ],
  },
  {
    visualHint: '咖啡馆窗边戴大耳机看窗外的人、手机屏幕静止的暂停符号与周围飘散的对话波纹',
    readings: [
      '把路人的闲聊当成白噪音，一个人发会儿呆',
      '等一个迟到的人，反而爱上了这段独处',
      '歌停了半小时，思绪早就顺着街角走远了',
      '最怕有人凑近打招呼，假装正忙着听播客',
    ],
  },
  {
    visualHint: '一只塞满发光书签却盖满薄灰的玻璃罐、旁边还不断有新纸条飞进去',
    readings: [
      '收藏了就约等于学会，给焦虑买一份心理安慰',
      '留给某个理想中的自己，总有一天会翻开',
      '其实不是舍不得删，是怕忘了当时为什么心动',
      '每塞进一张新纸条，就像又偷偷藏起一个念头',
    ],
  },
  {
    visualHint: '玻璃窗外倾盆夜雨、窗内暖黄灯光下冒白气的小纸杯与孤单高脚凳',
    readings: [
      '不想太早回空荡的家，在暖灯下多坐十分钟',
      '被一场突如其来的大雨，名正言顺按了暂停键',
      '一整天说太多话，只想和一杯热气安静待着',
      '陌生街角的白炽灯，反而比朋友圈更让人踏实',
    ],
  },
  {
    visualHint: '发出一朵微笑小花气泡的双手，背后藏着一只翻白眼瘫在椅子上的小猫影子',
    readings: [
      '把「好的」改成「好哒」，成年人的体面缓冲',
      '心里已经叹气三遍，面上还是挑了最温柔的词',
      '不是虚伪，只是懒得花半小时解释我没生气',
      '越是不熟的人，发出去的语气词反而越热情',
    ],
  },
  {
    visualHint: '空无一人的漆黑影厅里唯一亮着微光的座椅与缓缓向上滚动的星光长带',
    readings: [
      '故事刚落幕，还没准备好一秒回到亮灯的现实',
      '像对创作团队的小小致意，陪字幕走完最后一排',
      '其实是在等彩蛋，哪怕明知道大概率没有',
      '喜欢把刚才那一瞬的情绪，在暗处多捂热一会儿',
    ],
  },
  {
    visualHint: '凌乱被窝里伸出一只举着手机的手、床头一只穿了一半的袜子与空荡门廊',
    readings: [
      '嘴上说着马上出门，其实刚跟被窝谈完判',
      '醒来后必须先发二十分钟呆，不然不算开机',
      '明明约了期待的局，临出门前又突然想赖掉',
      '把闹钟按掉第三次，试图把周末再偷走五分钟',
    ],
  },
  {
    visualHint: '小推车里一个孤零零必需品旁边堆着五六个发光小摆件与彩带礼盒',
    readings: [
      '为了凑那一点满减，顺手买回一堆没用的开心',
      '忙完一整周，总觉得该带点亮晶晶的东西回家',
      '明知摆两天就会吃灰，但当下的心动值回票价',
      '清单只写了一样必需品，情绪自己加了五样',
    ],
  },
  {
    visualHint: '窗边摊开到一半的小行李箱、没叠完的毛衣、一张空白车票与吹动窗帘的晚风',
    readings: [
      '出发前一晚的兴奋，永远比真正到达还迷人',
      '其实哪里都行，只是想暂时换一座城市呼吸',
      '每次拖到最后才收拾，才算正式告别这阵子',
      '比起远方景点，更期待路上那段失联的空白',
    ],
  },
]

export const SUBTEXT_PROMPT_POOL_EN: readonly SubtextPromptTemplate[] = [
  {
    visualHint: 'A glowing midnight laptop stacked high with blank tabs, untouched tea, numberless clock, sleepy moon outside',
    readings: [
      'Just quit a long pursuit — mind finally blank',
      'Refusing to let today end in quiet empty tabs',
      'Solved life at 2 AM, saving it for tomorrow',
      'Still keeping a quiet window open for nobody',
    ],
  },
  {
    visualHint: 'Sunset ocean railway crossing barrier, green-and-cream coastal train, golden water, and an empty sunlit seaside road',
    readings: [
      'Slam Dunk: summer ends once the train passes',
      'Spirited Away: one-way train across the sea',
      '5cm/s: drifting apart across the same tracks',
      'Our Little Sister: salty breeze, quiet warmth',
    ],
  },
  {
    visualHint: 'Calm person wearing headphones with eyes closed under a starry cloud in an elevator corner while two figures chat nearby',
    readings: [
      'Social battery 0% — switching to airplane mode',
      'Using headphones as an invisibility cloak',
      'Nothing is playing — just borrowing 5 minutes',
      'Still stuck inside the song that just ended',
    ],
  },
  {
    visualHint: 'Dark desk monitor, zipped backpack already slung over the chair, wall clock hands two ticks before the top of the hour',
    readings: [
      'Two minutes to Friday — soul already downtown',
      'Finally shipped the hard thing — pure exhale',
      'No plans tonight, just refusing one extra min',
      'The day only feels mine once the screen dies',
    ],
  },
  {
    visualHint: 'Window-seat cafe listener wearing large headphones gazing out while phone screen shows a static pause symbol',
    readings: [
      'Using strangers’ chatter as cozy white noise',
      'Waiting on a late friend, loving the solitude',
      'Track paused ages ago — thoughts wandered off',
      'Looking busy so nobody breaks the quiet spell',
    ],
  },
  {
    visualHint: 'Overflowing dusty glass jar packed with glowing bookmark ribbons while fresh notes keep floating in',
    readings: [
      'Saving a link feels just close enough to done',
      'Kept for an imaginary future version of me',
      'Afraid to forget why that spark mattered once',
      'Each tucked note hides a quiet little daydream',
    ],
  },
  {
    visualHint: 'Pouring dark rain outside glass windows, warm yellow light over a steaming paper cup and lone stool inside',
    readings: [
      'Not ready for a quiet apartment just yet',
      'Grateful the downpour pressed pause for me',
      'Talked all day — just me and warm steam now',
      'Neon corner lights feel kinder than my feed',
    ],
  },
  {
    visualHint: 'Hands sending a smiling flower speech bubble while casting the shadow of an eye-rolling slouched cat',
    readings: [
      'Softening "ok" into "sounds great!!" to cope',
      'Sighed three times, still sent the warm reply',
      'Too tired to explain I am not actually mad',
      'The less we know each other, the warmer I type',
    ],
  },
  {
    visualHint: 'One faintly glowing seat in an empty dark theater watching a starry vertical ribbon drift upward',
    readings: [
      'Not ready for bright hallway lights just yet',
      'A tiny salute to the crew while names roll by',
      'Still hoping for a secret post-credits scene',
      'Keeping that last scene warm in the dark',
    ],
  },
  {
    visualHint: 'One hand raising a glowing phone out of tangled blankets beside a half-worn sock and empty hallway',
    readings: [
      'Texted "on my way" mid-negotiation with bed',
      'Need twenty blank minutes before booting up',
      'Excited all week, suddenly tempted to cancel',
      'Stealing five more minutes from the weekend',
    ],
  },
  {
    visualHint: 'One tiny necessity in a shopping basket buried under five glowing trinkets and ribboned novelty boxes',
    readings: [
      'Bought tiny joys just to hit free shipping',
      'Survived the week — earned something shiny',
      'Will gather dust, worth every cent right now',
      'Came for one chore; my mood added five treats',
    ],
  },
  {
    visualHint: 'Half-open suitcase by a window, unfolded sweater, blank ticket stub, evening breeze moving the curtains',
    readings: [
      'Night-before excitement beats arriving itself',
      'Anywhere works — just need unfamiliar air',
      'Packing last minute makes the chapter close',
      'Craving the offline hours on the way there',
    ],
  },
]

export const DRAW_PROMPT_POOL: readonly string[] = SUBTEXT_PROMPT_POOL.map((p) => p.readings[0])

export function detectLocaleFromTexts(texts: readonly string[]): 'zh' | 'en' {
  const combined = texts.join(' ')
  if (!combined.trim()) return 'zh'
  return /[\u4e00-\u9fff]/.test(combined) ? 'zh' : 'en'
}

export function findSubtextTemplate(
  word: string,
): { template: SubtextPromptTemplate; peerReadings: [string, string, string] } | undefined {
  const normalized = normalizeGuess(word)
  if (!normalized) return undefined
  for (const pool of [SUBTEXT_PROMPT_POOL, SUBTEXT_PROMPT_POOL_EN]) {
    for (const template of pool) {
      const idx = template.readings.findIndex((reading) => normalizeGuess(reading) === normalized)
      if (idx !== -1) {
        const peers = template.readings.filter((_, i) => i !== idx)
        return {
          template,
          peerReadings: [peers[0]!, peers[1]!, peers[2]!],
        }
      }
    }
  }
  return undefined
}

export function buildShuffledSubtextOptions(
  drawerReading: string,
  peerReadings: readonly [string, string, string],
  rng: () => number = Math.random,
): { options: SubtextOptions; correctOption: OptionKey } {
  const entries = [
    { text: drawerReading, isDrawerChoice: true },
    { text: peerReadings[0], isDrawerChoice: false },
    { text: peerReadings[1], isDrawerChoice: false },
    { text: peerReadings[2], isDrawerChoice: false },
  ]

  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = entries[i]!
    entries[i] = entries[j]!
    entries[j] = tmp
  }

  const options = {} as SubtextOptions
  let correctOption: OptionKey = 'A'
  OPTION_KEYS.forEach((key, idx) => {
    const entry = entries[idx]!
    options[key] = entry.text
    if (entry.isDrawerChoice) correctOption = key
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
  const available = sourcePool.filter(
    (item) => !item.readings.some((reading) => used.has(normalizeGuess(reading))),
  )
  const pool = available.length >= 3 ? available : [...sourcePool]
  const picked: SubtextPromptTemplate[] = []
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = (seedIndex * 5 + i * 3) % pool.length
    picked.push(pool.splice(idx, 1)[0]!)
  }
  return picked
}
