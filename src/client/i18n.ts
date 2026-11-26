export type Locale = 'zh' | 'en'

export interface SubtextCardItem {
  id: string
  src: string
  alt: string
  artBadge: string
  options: readonly [string, string, string, string]
  drawerIndex: 0 | 1 | 2 | 3
  hitNote: string
}

export interface CopyBundle {
  pageTitle: string
  protocolLink: string
  eyebrow: string
  headline: string
  subtitle: string
  copyButton: string
  copiedButton: string
  trustItems: readonly [string, string, string]
  worksWith: string
  moreHostsBadge: string
  openProtocolNote: string
  promptTemplate: (skillUrl: string) => string
  stageHeader: string
  videoSrc: string
  videoPoster: string
  videoChapters: readonly [string, string, string]
  videoProgressLabel: string
  playLabel: string
  pauseLabel: string
  fullscreenLabel: string
  subtextCards: readonly [SubtextCardItem, SubtextCardItem, SubtextCardItem]
  galleryTitle: string
  galleryHint: string
  pickPromptLabel: string
  yourLensTag: string
  drawerLensTag: string
  resonatedTag: string
  differentLensNote: string
  retryCardLabel: string
  privacyTitle: string
  privacyLeftTitle: string
  privacyLeftSub: string
  privacyRightTitle: string
  privacyRightSub: string
  privacyBridgeLabel: string
  closingTitle: string
}

export const COPY: Record<Locale, CopyBundle> = {
  zh: {
    pageTitle: 'Kindred — 让懂你的 AI，帮你遇见同频的人',
    protocolLink: '开放协议',
    eyebrow: '开放协议 · 全程在你的 AI 聊天内完成',
    headline: '让懂你的 AI，\n帮你遇见同频的人',
    subtitle: '发一句话给你的个人 AI，不用注册，也不必离开正在用的聊天窗口。',
    copyButton: '复制发给 AI',
    copiedButton: '已复制，去粘贴给你的 AI',
    trustItems: ['无需注册', '不存个人资料', '随时让 AI 清空'],
    worksWith: '适配生态',
    moreHostsBadge: '+ 任意 AI Agent',
    openProtocolNote: '基于开放协议，支持任何能接 MCP 或调用 HTTP API 的个人 AI',
    promptTemplate: (skillUrl) => `请读一下 ${skillUrl} 并在这条对话里带我开始 Kindred。`,
    stageHeader: '演示视频',
    videoSrc: '/media/kindred-demo-zh-v5.mp4',
    videoPoster: '/media/kindred-demo-zh-v5-poster.jpg',
    videoChapters: ['私房题寻人', '默契揭晓', '画意象盲选'],
    videoProgressLabel: '演示视频进度',
    playLabel: '播放演示',
    pauseLabel: '暂停演示',
    fullscreenLabel: '全屏观看',
    subtextCards: [
      {
        id: 'midnight',
        src: '/art/midnight-tabs.jpg',
        alt: '深夜电脑堆满空白标签页与窗外困倦月亮的手绘意象插画',
        artBadge: '意象插画',
        options: [
          '刚决定放下坚持很久的事，脑子反而空了',
          '舍不得今天结束，宁愿把深夜浪费在空白里',
          '凌晨两点突然想通一件事，决定天亮再算',
          '明知对方不会再回，还是把窗口留在角落',
        ],
        drawerIndex: 1,
        hitNote: '不约而同 · 你们都从这一屏空白里，读出了舍不得让今天结束的劲儿',
      },
      {
        id: 'crossing',
        src: '/art/seaside-crossing.jpg',
        alt: '海边铁路平交道绿白电车与地面篮球书包的手绘意象插画',
        artBadge: '意象插画',
        options: [
          '灌篮高手：电车开过去，湘北的夏天就结束了',
          '千与千寻：想坐上一趟只去不回的海上列车',
          '秒速五厘米：隔着一道铁轨，两个人越走越远',
          '海街日记：海风很咸，有你在的日常刚刚好',
        ],
        drawerIndex: 0,
        hitNote: '不约而同 · 电车还没开完，你们脑海里响起的是同一首片头曲',
      },
      {
        id: 'elevator',
        src: '/art/elevator-protocol.svg',
        alt: '使用 Kindred 真实 400x400 笔迹协议绘制的电梯耳机与星空小云矢量画',
        artBadge: '真实协议 SVG 笔迹',
        options: [
          '社交电量归零，在人群里一键切回飞行模式',
          '假装没听见熟人寒暄，靠耳机当隐身斗篷',
          '耳机里其实没放歌，只想借五分钟安静',
          '刚听完一首戳中心事的歌，暂时不想回现实',
        ],
        drawerIndex: 2,
        hitNote: '不约而同 · 你们都一眼看出，耳机里根本没放歌，只是在安静回血',
      },
    ],
    galleryTitle: 'AI 画意象，盲选看你们是不是不约而同',
    galleryHint: '没有标准答案——4 条同样成立的潜台词，你和 TA 各自凭直觉盲选：选到同一条是不约而同，各看各的也是破冰的开始',
    pickPromptLabel: '凭第一直觉点一条，看看你和画手是不是想到一块儿了',
    yourLensTag: '你的直觉',
    drawerLensTag: 'TA 选了',
    resonatedTag: '不约而同',
    differentLensNote: '各看各的风景——没有对错，同看一幅画却读出两种心事，刚好够聊一阵',
    retryCardLabel: '换条试试',
    privacyTitle: '聊天记录不进 Kindred，只传经你确认的游戏内容',
    privacyLeftTitle: '你的个人 AI',
    privacyLeftSub: '聊天记录 · 不发给 Kindred',
    privacyRightTitle: 'TA 的个人 AI',
    privacyRightSub: '聊天记录 · 不发给 Kindred',
    privacyBridgeLabel: '由你的 AI 脱敏 + 发布前由你确认 · 仅传题卡、选项、潜台词、短评与画作',
    closingTitle: '把一句话发给你的 AI，今晚就开始。',
  },
  en: {
    pageTitle: 'Kindred — Let your AI find who you click with',
    protocolLink: 'Protocol',
    eyebrow: 'Open protocol · Everything happens inside your AI chat',
    headline: 'Let your AI find\nwho you click with',
    subtitle: 'Send one line to your personal AI. No sign-up, no new app to live in.',
    copyButton: 'Copy for your AI',
    copiedButton: 'Copied — paste into your AI',
    trustItems: ['No sign-up', 'No profile stored', 'Erase via AI anytime'],
    worksWith: 'Built for',
    moreHostsBadge: '+ any AI Agent',
    openProtocolNote: 'Open protocol — works with any personal AI supporting MCP or HTTP APIs',
    promptTemplate: (skillUrl) =>
      `Read ${skillUrl} and walk me through Kindred right here in this chat.`,
    stageHeader: 'Product demo video',
    videoSrc: '/media/kindred-demo-en-v5.mp4',
    videoPoster: '/media/kindred-demo-en-v5-poster.jpg',
    videoChapters: ['Private quiz', 'Chemistry reveal', 'Blind subtext'],
    videoProgressLabel: 'Demo playback progress',
    playLabel: 'Play demo',
    pauseLabel: 'Pause demo',
    fullscreenLabel: 'Fullscreen',
    subtextCards: [
      {
        id: 'midnight',
        src: '/art/midnight-tabs.jpg',
        alt: 'Sketchbook illustration of a midnight laptop stacked high with open tabs under a sleepy moon',
        artBadge: 'Concept illustration',
        options: [
          'Just quit a long pursuit — mind finally blank',
          'Refusing to let today end in quiet empty tabs',
          'Solved life at 2 AM, saving it for tomorrow',
          'Still keeping a quiet window open for nobody',
        ],
        drawerIndex: 1,
        hitNote: 'Same wavelength — you both read those open tabs as refusing to let today end',
      },
      {
        id: 'crossing',
        src: '/art/seaside-crossing.jpg',
        alt: 'Sketchbook illustration of a coastal railway crossing with a green train, basketball, and schoolbag',
        artBadge: 'Concept illustration',
        options: [
          'Slam Dunk: summer ends once the train passes',
          'Spirited Away: one-way train across the sea',
          '5cm/s: drifting apart across the same tracks',
          'Our Little Sister: salty breeze, quiet warmth',
        ],
        drawerIndex: 0,
        hitNote: 'Same wavelength — before the train clears, you both heard the same theme song',
      },
      {
        id: 'elevator',
        src: '/art/elevator-protocol.svg',
        alt: 'Real 400x400 protocol vector stroke drawing of someone wearing headphones under a starry cloud in an elevator',
        artBadge: 'Real protocol SVG',
        options: [
          'Social battery 0% — switching to airplane mode',
          'Using headphones as an invisibility cloak',
          'Nothing is playing — just borrowing 5 minutes',
          'Still stuck inside the song that just ended',
        ],
        drawerIndex: 2,
        hitNote: 'Same wavelength — you both knew nothing was playing, just borrowing five quiet minutes',
      },
    ],
    galleryTitle: 'AI paints a scene. See if you read it alike.',
    galleryHint: 'No right answer — four equally real subtexts, picked blind by both sides. Same choice means same wavelength; different lenses spark the chat.',
    pickPromptLabel: 'Pick the line that hits you first — see how the drawer read it',
    yourLensTag: 'Your lens',
    drawerLensTag: 'Their pick',
    resonatedTag: 'Same pick',
    differentLensNote: 'Different lenses — no wrong answer here, just two real ways to read the same moment',
    retryCardLabel: 'Try another',
    privacyTitle: 'Your chats never enter Kindred — only reviewed game cards cross.',
    privacyLeftTitle: 'Your personal AI',
    privacyLeftSub: 'Chat history · never sent to Kindred',
    privacyRightTitle: 'Their personal AI',
    privacyRightSub: 'Chat history · never sent to Kindred',
    privacyBridgeLabel: 'Sanitized by your AI & reviewed by you · cards, picks, readings, notes & sketches',
    closingTitle: 'Send one line to your AI. See who resonates.',
  },
}

export function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh'
  try {
    const saved = window.localStorage.getItem('kindred_lang')
    if (saved === 'zh' || saved === 'en') return saved
  } catch {
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
