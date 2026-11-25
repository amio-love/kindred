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
  videoSrc: string
  videoPoster: string
  videoChapters: readonly [string, string, string]
  videoProgressLabel: string
  playLabel: string
  pauseLabel: string
  fullscreenLabel: string
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
    worksWith: '直接用在',
    promptTemplate: (skillUrl) => `请读一下 ${skillUrl}，然后在这条对话里带我开始 Kindred。`,
    stageHeader: '实景演示视频',
    videoSrc: '/media/kindred-demo-zh.mp4',
    videoPoster: '/media/kindred-demo-zh-poster.jpg',
    videoChapters: ['出题寻人', '默契揭晓', 'AI 画图猜词'],
    videoProgressLabel: '演示视频进度',
    playLabel: '播放演示',
    pauseLabel: '暂停演示',
    fullscreenLabel: '全屏观看',
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
    worksWith: 'Works inside',
    promptTemplate: (skillUrl) =>
      `Read ${skillUrl} and walk me through Kindred right here in this chat.`,
    stageHeader: 'Product demo video',
    videoSrc: '/media/kindred-demo-en.mp4',
    videoPoster: '/media/kindred-demo-en-poster.jpg',
    videoChapters: ['Private quiz', 'Chemistry reveal', 'AI draws, you guess'],
    videoProgressLabel: 'Demo playback progress',
    playLabel: 'Play demo',
    pauseLabel: 'Pause demo',
    fullscreenLabel: 'Fullscreen',
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
