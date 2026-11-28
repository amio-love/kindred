export interface QuizScenarioSeed {
  lens: string
  lensZh: string
  format: '2-choice' | '3-choice'
  angleEn: string
  angleZh: string
}

export const QUIZ_SCENARIO_SEEDS: readonly QuizScenarioSeed[] = [
  {
    lens: 'Binary Split · Appetite',
    lensZh: '极短劈裂·胃口',
    format: '2-choice',
    angleEn: 'Next year: good things or interesting things? (Good / Interesting)',
    angleZh: '明年宁愿发生「好事」还是「有趣的事」？（好事 / 有趣的事）',
  },
  {
    lens: 'Binary Split · Appetite',
    lensZh: '极短劈裂·胃口',
    format: '2-choice',
    angleEn: 'Prefer simple people or complex people in your life? (Simple / Complex)',
    angleZh: '朋友里更偏爱简单的人，还是复杂的人？（简单 / 复杂）',
  },
  {
    lens: 'Binary Split · Appetite',
    lensZh: '极短劈裂·胃口',
    format: '2-choice',
    angleEn: 'One-way ticket to sail away for two years — tempted? (Tempted / Hard pass)',
    angleZh: '给张单程船票，丢下一切去海上漂两年，心动吗？（心动 / 不心动）',
  },
  {
    lens: 'Binary Split · Appetite',
    lensZh: '极短劈裂·胃口',
    format: '2-choice',
    angleEn: 'Global internet outage for one full month — relief or panic? (Relief / Panic)',
    angleZh: '明天全世界断网一个月，你是爽还是慌？（爽 / 慌）',
  },
  {
    lens: 'Binary Split · Instinct',
    lensZh: '极短劈裂·本能',
    format: '2-choice',
    angleEn: 'Would you rather be right or be liked? (Be right / Be liked)',
    angleZh: '二选一：做对的那个人，还是讨喜的那个人？（做对 / 讨喜）',
  },
  {
    lens: 'Binary Split · Instinct',
    lensZh: '极短劈裂·本能',
    format: '2-choice',
    angleEn: 'Only get to know one: how you die, or when you die? (How / When)',
    angleZh: '只能知道一个：怎么死，还是哪天死？（怎么死 / 哪天死）',
  },
  {
    lens: 'Binary Split · Instinct',
    lensZh: '极短劈裂·本能',
    format: '2-choice',
    angleEn: 'Plans cancelled last minute — secretly relieved or annoyed? (Relieved / Annoyed)',
    angleZh: '约好的局临时取消，第一秒是暗爽还是烦？（暗爽 / 烦）',
  },
  {
    lens: 'Binary Split · Instinct',
    lensZh: '极短劈裂·本能',
    format: '2-choice',
    angleEn: 'In a weird light, would a sudden world reset feel exciting? (A little / No way)',
    angleZh: '从某种角度看，世界突然重启一次有点刺激？（有点 / 疯了吧）',
  },
  {
    lens: 'No-Escape Dilemma · Tradeoff',
    lensZh: '死路两难·取舍',
    format: '2-choice',
    angleEn: 'Save 5 strangers by burning the original Mona Lisa — pull the lever? (Pull / Don’t pull)',
    angleZh: '救 5 个陌生人，代价是烧掉《蒙娜丽莎》真迹——拉不拉杆？（拉 / 不拉）',
  },
  {
    lens: 'No-Escape Dilemma · Tradeoff',
    lensZh: '死路两难·取舍',
    format: '2-choice',
    angleEn: 'Everyone in town drank water that flips truth and lies; you’re last — drink? (Drink / Stay sane)',
    angleZh: '全村人都喝了颠倒黑白的愚人井水，只剩你清醒——喝不喝？（喝 / 不喝）',
  },
  {
    lens: 'No-Escape Dilemma · Tradeoff',
    lensZh: '死路两难·取舍',
    format: '2-choice',
    angleEn: 'Erase your worst memory, losing every good detail in it too — drink? (Drink / Keep it)',
    angleZh: '抹掉最痛的一段记忆，但连里面所有好细节一起清零——喝不喝？（喝 / 不喝）',
  },
  {
    lens: 'No-Escape Dilemma · Tradeoff',
    lensZh: '死路两难·取舍',
    format: '2-choice',
    angleEn: 'For ten years: never able to lie, or never able to spot a lie? (Can’t lie / Can’t spot)',
    angleZh: '未来十年二选一：永远说不出谎，还是永远听不出谎？（说不出 / 听不出）',
  },
  {
    lens: 'No-Escape Dilemma · Chaos',
    lensZh: '死路两难·脑洞',
    format: '2-choice',
    angleEn: 'Divert a trolley from 5 strangers onto a mystery box track — pull? (Pull / Don’t pull)',
    angleZh: '把电车从 5 个陌生人改道去「结果未知的盲盒轨道」——拉不拉？（拉 / 不拉）',
  },
  {
    lens: 'No-Escape Dilemma · Chaos',
    lensZh: '死路两难·脑洞',
    format: '2-choice',
    angleEn: 'Every lie within 10 feet makes the speaker sneeze, yours too — take it? (Deal / Pass)',
    angleZh: '方圆三米谁说谎就打喷嚏，包括你自己——要不要？（要 / 不要）',
  },
  {
    lens: 'No-Escape Dilemma · Chaos',
    lensZh: '死路两难·脑洞',
    format: '2-choice',
    angleEn: 'Dress sharp waist-up with clown pants, or vice versa for a year? (Waist-up / Waist-down)',
    angleZh: '出门一年二选一：上半身精致配小丑裤，还是反过来？（上精致 / 下精致）',
  },
  {
    lens: 'No-Escape Dilemma · Chaos',
    lensZh: '死路两难·脑洞',
    format: '2-choice',
    angleEn: 'Time machine shows your crush isn’t with you in 10 years — still go for it? (Still go / Walk away)',
    angleZh: '提前知道喜欢的人十年后不在你身边——现在追不追？（追 / 不追）',
  },
  {
    lens: 'Instant Projection · Sound',
    lensZh: '瞬间投射·听觉',
    format: '3-choice',
    angleEn: 'A door slowly creaks open late at night — first thought? (Intruder / Wrong room / Someone’s home)',
    angleZh: '深夜听到门缓缓打开，第一念头？（门后藏着人 / 走错门了 / 等的人回来了）',
  },
  {
    lens: 'Instant Projection · Sound',
    lensZh: '瞬间投射·听觉',
    format: '3-choice',
    angleEn: 'Sudden heavy rain hits the window — first flash? (Cozy inside / Ruined plans / Wet shoes)',
    angleZh: '窗外突然下起大雨，第一瞬间想到？（窝着真爽 / 约会泡汤 / 鞋子要湿）',
  },
  {
    lens: 'Instant Projection · Sound',
    lensZh: '瞬间投射·听觉',
    format: '3-choice',
    angleEn: 'Fast keyboard clacking next door — feels like? (Sudden spark / Angry rant / Too loud)',
    angleZh: '隔壁突然急促敲键盘，觉得他在？（突然有灵感 / 气炸吵架 / 太吵了）',
  },
  {
    lens: 'Instant Projection · Sound',
    lensZh: '瞬间投射·听觉',
    format: '3-choice',
    angleEn: 'A whale call echoes underwater — why is it calling? (Asking for help / Chatting / Hungry)',
    angleZh: '深海里一声鲸鸣，你觉得它在？（求救 / 找同伴聊天 / 饿了）',
  },
  {
    lens: 'Instant Projection · Image',
    lensZh: '瞬间投射·画面',
    format: '3-choice',
    angleEn: 'One last flower on a bare tree — it looks? (Lonely / Stubborn / About to fall)',
    angleZh: '光秃秃的树上只剩一朵花，觉得它？（好孤独 / 很倔 / 快谢了）',
  },
  {
    lens: 'Instant Projection · Image',
    lensZh: '瞬间投射·画面',
    format: '3-choice',
    angleEn: 'A bright empty train stops at midnight — your gut says? (Escape ride / Out of service / Weird destination)',
    angleZh: '午夜停下一列亮灯空车，直觉是？（专程接我逃跑 / 故障空车 / 开去怪地方）',
  },
  {
    lens: 'Instant Projection · Image',
    lensZh: '瞬间投射·画面',
    format: '3-choice',
    angleEn: 'Sea wind suddenly hits your face — first feeling? (Vacation / Time flying / Storm coming)',
    angleZh: '一阵海风扑面而来，第一感觉？（惬意度假 / 时间过太快 / 台风要来了）',
  },
  {
    lens: 'Instant Projection · Image',
    lensZh: '瞬间投射·画面',
    format: '3-choice',
    angleEn: 'A crackling spark in the dark — reminds you of? (Barbecue / Campfire / Short circuit)',
    angleZh: '暗处噼啪一声火花，立刻想到？（烤肉 / 篝火 / 电路着火）',
  },
  {
    lens: 'Wavelength · Call',
    lensZh: '波长站队·坐标',
    format: '2-choice',
    angleEn: 'Eating hotpot alone at midnight — peak luxury or a bit sad? (Peak luxury / Bit sad)',
    angleZh: '「半夜一个人吃火锅」偏哪边？（顶配享受 / 有点凄凉）',
  },
  {
    lens: 'Wavelength · Call',
    lensZh: '波长站队·坐标',
    format: '2-choice',
    angleEn: 'Reading breakdowns right after a great film? (Must read / Ruins the aftertaste)',
    angleZh: '「看完好电影立刻翻解析」偏哪边？（必须看 / 毁了余味）',
  },
  {
    lens: 'Wavelength · Call',
    lensZh: '波长站队·坐标',
    format: '2-choice',
    angleEn: '30 seconds of silence with someone new? (Comfy / Awkward)',
    angleZh: '「跟刚认识的人冷场 30 秒」偏哪边？（舒服自在 / 脚趾抠地）',
  },
  {
    lens: 'Wavelength · Call',
    lensZh: '波长站队·坐标',
    format: '2-choice',
    angleEn: 'Fun trash movie vs slow acclaimed masterpiece? (Fun trash / Masterpiece)',
    angleZh: '「爽片烂片」vs「公认神作但催眠」，诚实站哪边？（爽就行 / 看神作）',
  },
  {
    lens: 'Wavelength · Raw Truth',
    lensZh: '波长站队·真话',
    format: '3-choice',
    angleEn: 'Most honest warning label on you? (Ghosts to recharge / Tiny-hill stubborn / Says "whatever" with a hidden pick)',
    angleZh: '给自己贴张大实话标签？（突然省电失联 / 小事死倔 / 嘴上都行心里有谱）',
  },
  {
    lens: 'Wavelength · Raw Truth',
    lensZh: '波长站队·真话',
    format: '2-choice',
    angleEn: 'More afraid of seeming boring or seeming weird? (Boring / Weird)',
    angleZh: '更怕被人觉得无聊，还是觉得奇怪？（怕无聊 / 怕奇怪）',
  },
  {
    lens: 'Wavelength · Raw Truth',
    lensZh: '波长站队·真话',
    format: '3-choice',
    angleEn: 'Instant green flag in a stranger? (Sharp quiet roast / Niche obsession / Leaves with zero fake excuses)',
    angleZh: '陌生人最让你瞬间加分的一刻？（小声精准吐槽 / 讲冷门执念发亮 / 没电量直说先溜）',
  },
  {
    lens: 'Wavelength · Raw Truth',
    lensZh: '波长站队·真话',
    format: '3-choice',
    angleEn: '2 AM thought that still hits? (Always rushing next / Guard up yet want to be seen / Done explaining)',
    angleZh: '深夜偶尔戳中你的一句？（一直在赶下一站 / 防备又想被看穿 / 懒得解释了）',
  },
]

export function sampleQuizSeeds(count = 8, rng: () => number = Math.random): QuizScenarioSeed[] {
  const byLens = new Map<string, QuizScenarioSeed[]>()
  for (const seed of QUIZ_SCENARIO_SEEDS) {
    const bucket = byLens.get(seed.lens)
    if (bucket) {
      bucket.push(seed)
    } else {
      byLens.set(seed.lens, [seed])
    }
  }

  const lenses = Array.from(byLens.keys())
  for (let i = lenses.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = lenses[i]!
    lenses[i] = lenses[j]!
    lenses[j] = tmp
  }

  const picked: QuizScenarioSeed[] = []
  for (const lens of lenses) {
    if (picked.length >= count) break
    const bucket = byLens.get(lens)!
    const idx = Math.floor(rng() * bucket.length)
    picked.push(bucket[idx]!)
  }
  return picked
}
