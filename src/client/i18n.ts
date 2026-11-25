export type Locale = 'zh' | 'en'

export interface CopyBundle {
  pageTitle: string
  protocolLink: string
  headline: string
  subtitle: string
  copyButton: string
  copiedButton: string
  trustItems: readonly [string, string, string]
  worksWith: string
  promptTemplate: (skillUrl: string) => string
  stageHeader: string
  stageLiveTag: string
  scenes: readonly [
    {
      id: 'quiz'
      tab: string
      userLine: string
      aiIntro: string
      question: string
      options: readonly [string, string, string, string]
      pickedIndex: number
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
      hintChip: string
      guessBubble: string
      winBadge: string
    },
  ]
}

export const COPY: Record<Locale, CopyBundle> = {
  zh: {
    pageTitle: 'Kindred — 让懂你的 AI，帮你遇见同频的人',
    protocolLink: '开放协议',
    headline: '让懂你的 AI，\n帮你遇见同频的人',
    subtitle: '把下面这句话发给你的 AI，其余都在聊天里完成。',
    copyButton: '复制发给 AI',
    copiedButton: '已复制，去粘贴给你的 AI',
    trustItems: ['无需注册', '不存个人资料', '随时一键清空'],
    worksWith: '适用于',
    promptTemplate: (skillUrl) => `请读一下 ${skillUrl}，然后在这条对话里带我开始 Kindred。`,
    stageHeader: '你的个人 AI 对话',
    stageLiveTag: '全程在聊天内完成',
    scenes: [
      {
        id: 'quiz',
        tab: 'AI 出私房题',
        userLine: '帮我开始 Kindred',
        aiIntro: '基于平时的了解，替你拟了 6 道不涉隐私的小题，看一眼满意我就发：',
        question: '晚上准备睡觉，手机一般放哪儿？',
        options: ['放床头静音', '放卧室外面', '枕边刷会儿', '客厅充电'],
        pickedIndex: 1,
        statusBadge: '已发出 · 后台安静寻人中',
      },
      {
        id: 'reveal',
        tab: '默契揭晓',
        eyebrow: '刚找到一位同频的人 · 你亲答完揭晓',
        humanLabel: '你们俩的默契',
        aiLabel: '你和 AI 的同步率',
        callout: '你的 AI 有 1 题猜偏了，已顺手记住你的真选择',
        anchorBubble: '「手机放卧室外面」这条居然完全一样！',
      },
      {
        id: 'draw',
        tab: 'AI 画图猜词',
        aiPrompt: '对方出了一道词，TA 的 AI 刚画好这张图：',
        hintChip: '5 个字',
        guessBubble: '戴墨镜的猫！',
        winBadge: '猜中了 · 轮到你的 AI 反画',
      },
    ],
  },
  en: {
    pageTitle: 'Kindred — Let your AI find the people you click with',
    protocolLink: 'Protocol',
    headline: 'Let your AI find the people you click with',
    subtitle: 'Send one line to your AI. Everything else happens in chat.',
    copyButton: 'Copy for your AI',
    copiedButton: 'Copied — paste into your AI',
    trustItems: ['No sign-up', 'No profile stored', 'Erase anytime'],
    worksWith: 'Works with',
    promptTemplate: (skillUrl) =>
      `Read ${skillUrl} and walk me through Kindred right here in this chat.`,
    stageHeader: 'Inside your AI chat',
    stageLiveTag: 'Everything stays in chat',
    scenes: [
      {
        id: 'quiz',
        tab: 'Private quiz',
        userLine: 'Start Kindred for me',
        aiIntro: 'Drafted 6 private-safe questions from what I know about you. Good to publish?',
        question: 'Where does your phone sleep at night?',
        options: ['Nightstand', 'Outside bedroom', 'In bed', 'Living room'],
        pickedIndex: 1,
        statusBadge: 'Live · matching quietly in the background',
      },
      {
        id: 'reveal',
        tab: 'Chemistry reveal',
        eyebrow: 'Kindred match found · unlocked after your pass',
        humanLabel: 'Human match',
        aiLabel: 'You & your AI',
        callout: 'Your AI missed 1 pick — memory calibrated on the spot',
        anchorBubble: '"Phone outside the bedroom" — exact same habit!',
      },
      {
        id: 'draw',
        tab: 'AI draws, you guess',
        aiPrompt: 'They picked a word. Their AI just sent this sketch:',
        hintChip: '3 words',
        guessBubble: 'Cat in sunglasses!',
        winBadge: 'Spot on · your AI draws next',
      },
    ],
  },
}

export function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh'
  const saved = window.localStorage.getItem('kindred_lang')
  if (saved === 'zh' || saved === 'en') return saved
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
