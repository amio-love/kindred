export type Locale = 'zh' | 'en'

export interface SubtextCardItem {
  id: string
  src: string
  alt: string
  artBadge: string
  options: readonly [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
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
  surfaceTag: string
  wavelengthTag: string
  surfaceRetryNote: string
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
    videoChapters: ['私房题寻人', '默契揭晓', '画意象选真意'],
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
          '半夜还在赶方案加班',
          '忘了关电脑就睡着了',
          '舍不得今天结束的报复性熬夜',
          '晚上喝太多茶失眠了',
        ],
        correctIndex: 2,
        hitNote: '同频命中 · 不用解释，你一眼就懂这种舍不得睡的劲儿',
      },
      {
        id: 'crossing',
        src: '/art/seaside-crossing.jpg',
        alt: '海边铁路平交道绿白电车与地面篮球书包的手绘意象插画',
        artBadge: '意象插画',
        options: [
          '放学后等电车回家',
          '湘北平交道的那个夏天',
          '周末去海边打球',
          '海滨小镇的铁道风景',
        ],
        correctIndex: 1,
        hitNote: '同频命中 · 圈外人只看到电车和篮球，懂的人一秒听见片头曲',
      },
      {
        id: 'elevator',
        src: '/art/elevator-protocol.svg',
        alt: '使用 Kindred 真实 400x400 笔迹协议绘制的电梯耳机与星空小云矢量画',
        artBadge: '真实协议 SVG 笔迹',
        options: [
          '下班路上听歌放松',
          '担心外面突然下雨',
          '在电梯里忘了按楼层',
          '社交电量归零，自动切回飞行模式',
        ],
        correctIndex: 3,
        hitNote: '同频命中 · 表面是在听歌，真正懂你的人知道你只是在安静回血',
      },
    ],
    galleryTitle: 'AI 画意象，猜中真意才算同频',
    galleryHint: '不猜字面物体，猜画面背后的暗号——路人看到表面，同频的人一秒点中真意',
    pickPromptLabel: '选一条你觉得 TA 真正想表达的暗号',
    surfaceTag: '表面解读',
    wavelengthTag: '同频暗号',
    surfaceRetryNote: '你选了表面解读——上面绿标才是藏在画面背后的同频暗号',
    retryCardLabel: '再玩一次',
    privacyTitle: '聊天记录不进 Kindred，只传经筛查与你确认的游戏内容',
    privacyLeftTitle: '你的个人 AI',
    privacyLeftSub: '聊天记录 · 不发给 Kindred',
    privacyRightTitle: 'TA 的个人 AI',
    privacyRightSub: '聊天记录 · 不发给 Kindred',
    privacyBridgeLabel: '自动筛查 + 发布前由你确认 · 仅传题卡、选项、暗号、短评与画作',
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
    videoChapters: ['Private quiz', 'Chemistry reveal', 'Read the subtext'],
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
          'Pulling an all-nighter for work',
          'Forgot to shut down the laptop',
          'Revenge bedtime procrastination',
          'Too much late-night caffeine',
        ],
        correctIndex: 2,
        hitNote: 'Same wavelength — no explanation needed for refusing to let today end',
      },
      {
        id: 'crossing',
        src: '/art/seaside-crossing.jpg',
        alt: 'Sketchbook illustration of a coastal railway crossing with a green train, basketball, and schoolbag',
        artBadge: 'Concept illustration',
        options: [
          'Waiting for the evening train home',
          'That Slam Dunk coastal crossing',
          'Weekend basketball by the beach',
          'Quiet seaside railway scenery',
        ],
        correctIndex: 1,
        hitNote: 'Same wavelength — strangers see a train; kindred minds hear the opening theme',
      },
      {
        id: 'elevator',
        src: '/art/elevator-protocol.svg',
        alt: 'Real 400x400 protocol vector stroke drawing of someone wearing headphones under a starry cloud in an elevator',
        artBadge: 'Real protocol SVG',
        options: [
          'Unwinding with music on the commute',
          'Worried about rain outside',
          'Forgot to hit my floor button',
          'Social battery 0% — airplane mode',
        ],
        correctIndex: 3,
        hitNote: 'Same wavelength — on the surface it is headphones; to your people it is quiet recharge',
      },
    ],
    galleryTitle: 'AI paints the vibe. Spot the real subtext.',
    galleryHint: 'No literal object guessing — outsiders read the surface, kindred minds catch the hidden meaning',
    pickPromptLabel: 'Pick what they really meant behind the sketch',
    surfaceTag: 'Surface',
    wavelengthTag: 'True subtext',
    surfaceRetryNote: 'You picked the literal surface read — the highlighted line is the real subtext',
    retryCardLabel: 'Try again',
    privacyTitle: 'Your chats never enter Kindred — only reviewed game cards cross.',
    privacyLeftTitle: 'Your personal AI',
    privacyLeftSub: 'Chat history · never sent to Kindred',
    privacyRightTitle: 'Their personal AI',
    privacyRightSub: 'Chat history · never sent to Kindred',
    privacyBridgeLabel: 'Auto-screened & human-reviewed · cards, picks, subtexts, notes & sketches',
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
