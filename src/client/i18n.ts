export type Locale = 'zh' | 'en'

export type HostId =
  | 'doubao'
  | 'deepseek'
  | 'workbuddy'
  | 'kimi'
  | 'qwen'
  | 'yuanbao'
  | 'muse'
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'grok'
  | 'perplexity'
  | 'openclaw'

export interface HostItem {
  id: HostId
  zh: string
  en: string
  icon: string
  plate?: 'avatar' | 'light'
}

export interface ChapterItem {
  num: string
  label: string
  sub: string
}

export interface CopyBundle {
  pageTitle: string
  protocolLink: string
  eyebrow: string
  headlinePrefix: string
  headlineAccent: string
  headlineSuffix: string
  subtitle: string
  slipFrom: string
  slipTo: string
  slipNote: string
  copyButton: string
  copiedButton: string
  copyFallback: string
  liveCopied: string
  promptBefore: string
  promptAfter: string
  hostsPre: string
  hostsPost: string
  slotAria: string
  hostListPrefix: string
  trustItems: readonly [string, string, string]
  stageTag: string
  stageCaption: string
  videoSrc: string
  videoPoster: string
  chaptersAria: string
  chapters: readonly [ChapterItem, ChapterItem, ChapterItem]
  playLabel: string
  pauseLabel: string
  fullscreenLabel: string
  inPhase: string
  footBy: string
  mission: string
}

export const HOSTS: Record<HostId, HostItem> = {
  doubao: { id: 'doubao', zh: '豆包', en: 'Doubao', icon: '/icons/doubao.png', plate: 'avatar' },
  deepseek: { id: 'deepseek', zh: 'DeepSeek', en: 'DeepSeek', icon: '/icons/deepseek.svg', plate: 'light' },
  workbuddy: { id: 'workbuddy', zh: 'WorkBuddy', en: 'WorkBuddy', icon: '/icons/workbuddy.svg', plate: 'avatar' },
  kimi: { id: 'kimi', zh: 'Kimi', en: 'Kimi', icon: '/icons/kimi.svg' },
  qwen: { id: 'qwen', zh: '千问', en: 'Qwen', icon: '/icons/qwen.svg', plate: 'light' },
  yuanbao: { id: 'yuanbao', zh: '元宝', en: 'Yuanbao', icon: '/icons/yuanbao.svg' },
  muse: { id: 'muse', zh: 'Meta Muse', en: 'Meta Muse', icon: '/icons/muse.svg', plate: 'light' },
  chatgpt: { id: 'chatgpt', zh: 'ChatGPT', en: 'ChatGPT', icon: '/icons/chatgpt.svg' },
  claude: { id: 'claude', zh: 'Claude', en: 'Claude', icon: '/icons/claude.svg' },
  gemini: { id: 'gemini', zh: 'Gemini', en: 'Gemini', icon: '/icons/gemini.svg' },
  grok: { id: 'grok', zh: 'Grok', en: 'Grok', icon: '/icons/grok.svg' },
  perplexity: { id: 'perplexity', zh: 'Perplexity', en: 'Perplexity', icon: '/icons/perplexity.svg' },
  openclaw: { id: 'openclaw', zh: 'OpenClaw', en: 'OpenClaw', icon: '/icons/openclaw.svg' },
}

export const HOST_ORDER: Record<Locale, readonly HostId[]> = {
  zh: [
    'doubao',
    'deepseek',
    'kimi',
    'qwen',
    'yuanbao',
    'workbuddy',
    'chatgpt',
    'claude',
    'gemini',
    'grok',
    'perplexity',
    'muse',
    'openclaw',
  ],
  en: [
    'chatgpt',
    'claude',
    'gemini',
    'grok',
    'perplexity',
    'deepseek',
    'muse',
    'openclaw',
    'kimi',
    'qwen',
    'doubao',
    'yuanbao',
    'workbuddy',
  ],
}

export const COPY: Record<Locale, CopyBundle> = {
  zh: {
    pageTitle: 'Kindred — 让懂你的 AI，帮你找到同频的人',
    protocolLink: '开放协议',
    eyebrow: '开放协议 · 全程在你的 AI 聊天里完成',
    headlinePrefix: '帮你找到',
    headlineAccent: '同频',
    headlineSuffix: '的人',
    subtitle: '发一句话给你的个人 AI，不用注册，也不用离开正在聊的窗口。',
    slipFrom: '你',
    slipTo: '你的 AI',
    slipNote: '点卡片任意处也能复制',
    copyButton: '复制这句话',
    copiedButton: '已复制，去粘贴给你的 AI',
    copyFallback: '已选中，按 ⌘C / Ctrl+C 复制',
    liveCopied: '已复制到剪贴板',
    promptBefore: '请读一下 ',
    promptAfter: ' 并在这条对话里带我开始 Kindred。',
    hostsPre: '发给',
    hostsPost: '或任何能接 MCP / HTTP 的个人 AI',
    slotAria: '换下一个支持的 AI',
    hostListPrefix: '支持的个人 AI 示例：',
    trustItems: ['无需注册', '不存个人资料', '随时让 AI 清空'],
    stageTag: '真实聊天流程 · 15 秒',
    stageCaption:
      '演示视频：在你自己的 AI 聊天里粘贴一句话，AI 先弹卡让你选，再单向匹配揭晓默契，最后进入画意象盲选。',
    videoSrc: '/media/kindred-demo-zh-v7.mp4',
    videoPoster: '/media/kindred-demo-zh-v7-poster.jpg',
    chaptersAria: '演示章节',
    chapters: [
      { num: '01', label: '私房题寻人', sub: '你先选，再看 AI 猜中几道' },
      { num: '02', label: '默契揭晓', sub: '一方读懂，立刻揭晓' },
      { num: '03', label: '画意象盲选', sub: '没有标准答案的盲选' },
    ],
    playLabel: '播放演示',
    pauseLabel: '暂停演示',
    fullscreenLabel: '全屏观看',
    inPhase: '同频',
    footBy: 'Kindred · AMIO 出品',
    mission: '万物皆可生成，唯有真实共度的时刻不可替代。',
  },
  en: {
    pageTitle: 'Kindred — Let your AI find who you click with',
    protocolLink: 'Protocol',
    eyebrow: 'Open protocol · Everything happens inside your AI chat',
    headlinePrefix: 'who you ',
    headlineAccent: 'click with',
    headlineSuffix: '',
    subtitle: 'Send one line to your personal AI. No sign-up, no new app to live in.',
    slipFrom: 'You',
    slipTo: 'Your AI',
    slipNote: 'Tap anywhere on the card to copy',
    copyButton: 'Copy this line',
    copiedButton: 'Copied — paste it into your AI',
    copyFallback: 'Selected — press ⌘C / Ctrl+C',
    liveCopied: 'Copied to clipboard',
    promptBefore: 'Read ',
    promptAfter: ' and walk me through Kindred right here in this chat.',
    hostsPre: 'Paste into',
    hostsPost: 'or any personal AI that speaks MCP or HTTP',
    slotAria: 'Show the next supported AI',
    hostListPrefix: 'Example personal AIs: ',
    trustItems: ['No sign-up', 'No profile stored', 'Erase via your AI anytime'],
    stageTag: 'The real in-chat flow · 15 s',
    stageCaption:
      'Demo video: paste one line into your own AI chat, pick your answers on cards first, see a one-way match reveal your chemistry, then play the blind visual-subtext round.',
    videoSrc: '/media/kindred-demo-en-v7.mp4',
    videoPoster: '/media/kindred-demo-en-v7-poster.jpg',
    chaptersAria: 'Demo chapters',
    chapters: [
      { num: '01', label: 'Private quiz', sub: 'You pick first, then check your AI' },
      { num: '02', label: 'Chemistry reveal', sub: 'One side clicks, it reveals' },
      { num: '03', label: 'Blind subtext', sub: 'Blind picks, no right answer' },
    ],
    playLabel: 'Play demo',
    pauseLabel: 'Pause demo',
    fullscreenLabel: 'Fullscreen',
    inPhase: 'in phase',
    footBy: 'Kindred · by AMIO',
    mission: 'Everything can be generated. Nothing replaces real moments together.',
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
