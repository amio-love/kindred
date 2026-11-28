export type Locale = 'zh' | 'en'

export type HostId =
  | 'muse'
  | 'claude'
  | 'chatgpt'
  | 'openclaw'
  | 'workbuddy'
  | 'perplexity'
  | 'grok'

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
  muse: { id: 'muse', zh: 'Meta Muse', en: 'Meta Muse', icon: '/icons/muse.svg', plate: 'light' },
  claude: { id: 'claude', zh: 'Claude', en: 'Claude', icon: '/icons/claude.svg' },
  chatgpt: { id: 'chatgpt', zh: 'ChatGPT', en: 'ChatGPT', icon: '/icons/chatgpt.svg' },
  openclaw: { id: 'openclaw', zh: 'OpenClaw', en: 'OpenClaw', icon: '/icons/openclaw.svg' },
  workbuddy: { id: 'workbuddy', zh: 'WorkBuddy', en: 'WorkBuddy', icon: '/icons/workbuddy.svg', plate: 'avatar' },
  perplexity: { id: 'perplexity', zh: 'Perplexity', en: 'Perplexity', icon: '/icons/perplexity.svg' },
  grok: { id: 'grok', zh: 'Grok', en: 'Grok', icon: '/icons/grok.svg' },
}

export const HOST_ORDER: Record<Locale, readonly HostId[]> = {
  zh: ['muse', 'claude', 'chatgpt', 'openclaw', 'workbuddy', 'perplexity', 'grok'],
  en: ['claude', 'chatgpt', 'muse', 'openclaw', 'perplexity', 'grok', 'workbuddy'],
}

export const COPY: Record<Locale, CopyBundle> = {
  zh: {
    pageTitle: 'Kindred — 让懂你的 AI，帮你找到同频的人',
    protocolLink: 'MCP',
    eyebrow: '远程 MCP · 全程在你的 AI 聊天里完成',
    headlinePrefix: '帮你找到',
    headlineAccent: '同频',
    headlineSuffix: '的人',
    subtitle: '把下面的 MCP 地址添加进你的个人 AI，一键匿名连接，就在聊天里开始。',
    slipFrom: 'Kindred',
    slipTo: '你的 AI',
    slipNote: '连上后在聊天里说「开始玩 Kindred」',
    copyButton: '复制 MCP 地址',
    copiedButton: '已复制，去添加给你的 AI',
    copyFallback: '已选中，按 ⌘C / Ctrl+C 复制',
    liveCopied: '已复制 MCP 地址',
    hostsPre: '支持',
    hostsPost: '等任何能接远程 MCP 的个人 AI',
    slotAria: '换下一个支持的 AI',
    hostListPrefix: '支持远程 MCP 的个人 AI 示例：',
    trustItems: ['无需注册', '不存个人资料', '随时让 AI 清空'],
    stageTag: '真实聊天流程 · 15 秒',
    stageCaption:
      '演示视频：连上 Kindred MCP 后，在你的 AI 聊天里先盲选私房题，单向匹配揭晓默契，再玩画意象盲选。',
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
    protocolLink: 'MCP',
    eyebrow: 'Remote MCP · Everything happens inside your AI chat',
    headlinePrefix: 'who you ',
    headlineAccent: 'click with',
    headlineSuffix: '',
    subtitle: 'Add this MCP URL to your personal AI, approve anonymously in one click, and play right in chat.',
    slipFrom: 'Kindred',
    slipTo: 'Your AI',
    slipNote: 'Then say “Start Kindred” in chat',
    copyButton: 'Copy MCP URL',
    copiedButton: 'Copied — add to your AI',
    copyFallback: 'Selected — press ⌘C / Ctrl+C',
    liveCopied: 'MCP URL copied to clipboard',
    hostsPre: 'Works with',
    hostsPost: 'and any personal AI that supports remote MCP',
    slotAria: 'Show the next supported AI',
    hostListPrefix: 'Example remote-MCP personal AIs: ',
    trustItems: ['No sign-up', 'No profile stored', 'Erase via your AI anytime'],
    stageTag: 'The real in-chat flow · 15 s',
    stageCaption:
      'Demo video: connect Kindred MCP in your own AI chat, pick your quiz answers on cards first, see a one-way match reveal your chemistry, then play the blind visual-subtext round.',
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
