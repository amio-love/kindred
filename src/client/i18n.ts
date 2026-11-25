export type Locale = 'zh' | 'en'

export interface SketchItem {
  id: string
  src: string
  hint: string
  answer: string
  alt: string
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
  promptTemplate: (skillUrl: string) => string
  stageHeader: string
  stageLiveTag: string
  interactiveHint: string
  nextSketch: string
  exclaim: string
  scenes: readonly [
    {
      id: 'quiz'
      tab: string
      userLine: string
      aiIntro: string
      question: string
      options: readonly [string, string, string, string]
      defaultPickedIndex: number
      statusBadge: string
    },
    {
      id: 'reveal'
      tab: string
      eyebrow: string
      humanLabel: string
      aiLabel: string
      callout: string
      anchorBubble: string
    },
    {
      id: 'draw'
      tab: string
      aiPrompt: string
      winBadge: string
    },
  ]
  sketches: readonly [SketchItem, SketchItem, SketchItem]
  galleryTitle: string
  galleryHint: string
  revealPromptLabel: string
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
    trustItems: ['无需注册', '不存个人资料', '随时一键清空'],
    worksWith: '支持',
    promptTemplate: (skillUrl) => `请读一下 ${skillUrl}，然后在这条对话里带我开始 Kindred。`,
    stageHeader: '你的个人 AI 对话',
    stageLiveTag: '可直接点击体验',
    interactiveHint: '点一个选项试试',
    nextSketch: '换一幅',
    exclaim: '！',
    scenes: [
      {
        id: 'quiz',
        tab: 'AI 出私房题',
        userLine: '帮我开始 Kindred',
        aiIntro: '根据平时的了解，替你拟了 6 道不涉隐私的小题，满意我就发出：',
        question: '晚上准备睡觉，手机一般放哪儿？',
        options: ['放床头静音', '放卧室外面', '枕边刷会儿', '客厅充电'],
        defaultPickedIndex: 1,
        statusBadge: '6 题已发 · 后台安静寻人中',
      },
      {
        id: 'reveal',
        tab: '默契揭晓',
        eyebrow: '遇见同频的人 · 真人亲答后解锁',
        humanLabel: '你们俩的默契',
        aiLabel: '你和 AI 的同步率',
        callout: '你的 AI 有 1 题猜偏了，已顺手记住你的真实选择',
        anchorBubble: '「手机放卧室外面」这条居然完全一样！',
      },
      {
        id: 'draw',
        tab: 'AI 画图猜词',
        aiPrompt: '对方出了一道词，TA 的 AI 刚交出这幅画：',
        winBadge: '猜中了 · 轮到你的 AI 反画',
      },
    ],
    sketches: [
      {
        id: 'cat',
        src: '/art/sunglasses-cat.jpg',
        hint: '5 个字',
        answer: '戴墨镜的猫',
        alt: '戴墨镜的猫简笔插画',
      },
      {
        id: 'coffee',
        src: '/art/winged-coffee.jpg',
        hint: '7 个字',
        answer: '长翅膀的咖啡杯',
        alt: '长翅膀的咖啡杯简笔插画',
      },
      {
        id: 'volcano',
        src: '/art/yawning-volcano.jpg',
        hint: '6 个字',
        answer: '打哈欠的火山',
        alt: '打哈欠的火山简笔插画',
      },
    ],
    galleryTitle: '选词交给你，画画交给 AI',
    galleryHint: '点开每一张，猜猜 AI 画的是什么',
    revealPromptLabel: '点击揭晓',
    privacyTitle: '记忆留在你这边，穿过协议的只有选项和画',
    privacyLeftTitle: '你的个人 AI',
    privacyLeftSub: '真实记忆与聊天 · 永不离开',
    privacyRightTitle: 'TA 的个人 AI',
    privacyRightSub: '真实记忆与聊天 · 永不离开',
    privacyBridgeLabel: '仅交换脱敏选项 A/B/C/D/U 与画作',
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
    trustItems: ['No sign-up', 'No profile stored', 'Erase anytime'],
    worksWith: 'Works with',
    promptTemplate: (skillUrl) =>
      `Read ${skillUrl} and walk me through Kindred right here in this chat.`,
    stageHeader: 'Inside your AI chat',
    stageLiveTag: 'Interactive preview',
    interactiveHint: 'Try picking one',
    nextSketch: 'Next sketch',
    exclaim: '!',
    scenes: [
      {
        id: 'quiz',
        tab: 'Private quiz',
        userLine: 'Start Kindred for me',
        aiIntro: 'Drafted 6 private-safe questions from what I know about you. Ready to publish?',
        question: 'Where does your phone sleep at night?',
        options: ['Nightstand', 'Outside bedroom', 'In bed', 'Living room'],
        defaultPickedIndex: 1,
        statusBadge: '6 live · matching quietly in the background',
      },
      {
        id: 'reveal',
        tab: 'Chemistry reveal',
        eyebrow: 'Kindred match · unlocked after your pass',
        humanLabel: 'Human match',
        aiLabel: 'You & your AI',
        callout: 'Your AI missed 1 pick — memory calibrated on the spot',
        anchorBubble: '"Phone outside the bedroom" — exact same habit!',
      },
      {
        id: 'draw',
        tab: 'AI draws, you guess',
        aiPrompt: 'They picked a prompt. Their AI just sketched this:',
        winBadge: 'Spot on · your AI draws next',
      },
    ],
    sketches: [
      {
        id: 'cat',
        src: '/art/sunglasses-cat.jpg',
        hint: '3 words',
        answer: 'Cat in sunglasses',
        alt: 'Sketchbook illustration of a cat wearing sunglasses',
      },
      {
        id: 'coffee',
        src: '/art/winged-coffee.jpg',
        hint: '3 words',
        answer: 'Winged coffee mug',
        alt: 'Sketchbook illustration of a steaming coffee mug with wings',
      },
      {
        id: 'volcano',
        src: '/art/yawning-volcano.jpg',
        hint: '2 words',
        answer: 'Yawning volcano',
        alt: 'Sketchbook illustration of a sleepy yawning volcano',
      },
    ],
    galleryTitle: 'You pick the prompt. Your AI draws.',
    galleryHint: 'Tap any card to reveal what the AI drew',
    revealPromptLabel: 'Tap to reveal',
    privacyTitle: 'Your chats stay local. Only A/B/C/D and sketches cross.',
    privacyLeftTitle: 'Your personal AI',
    privacyLeftSub: 'Real memories · never leave',
    privacyRightTitle: 'Their personal AI',
    privacyRightSub: 'Real memories · never leave',
    privacyBridgeLabel: 'Only A/B/C/D/U signals & sketches cross',
    closingTitle: 'Send one line to your AI. See who resonates.',
  },
}

export function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh'
  const saved = window.localStorage.getItem('kindred_lang')
  if (saved === 'zh' || saved === 'en') return saved
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
