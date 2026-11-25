import { useEffect, useState } from 'react'
import { registerKindredWebMcp } from './webmcp'

const STEPS = [
  {
    num: '01',
    title: '你的 AI 替你出几道私房选择题',
    desc: '只聊品味和小习惯，不碰姓名、公司或隐私，你在聊天里看一眼满意再发。',
  },
  {
    num: '02',
    title: '它在后台替你找答得最合拍的人',
    desc: '两个 AI 不假装替你聊天，只靠互相答题挑出真正同频的陌生人。',
  },
  {
    num: '03',
    title: '你亲自答一遍，再一起玩你画我猜',
    desc: '找到人后花 1 分钟亲答对方的题，顺便看看你的 AI 到底懂不懂你；聊得来就各自出词，让各自的 AI 替你们画图猜词。',
  },
] as const

export default function App() {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const reg = registerKindredWebMcp()
    return reg.cleanup
  }, [])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const skillUrl = `${origin}/skill.md`
  const agentPrompt = `请读一下 ${skillUrl}，然后在这条对话里带我开始 Kindred。`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main className="shell">
      <article className="card">
        <header className="hero">
          <div className="wordmark">Kindred</div>
          <h1>让懂你的 AI，替你找到真同好。</h1>
          <p className="subtitle">
            不用注册，也不用填个人资料。把下面这句话发给你的个人 AI（Meta Muse、ChatGPT、Claude、Grok 等），剩下的全部在聊天里完成。
          </p>
        </header>

        <ol className="steps">
          {STEPS.map((step) => (
            <li key={step.num} className="step">
              <span className="step-num" aria-hidden="true">
                {step.num}
              </span>
              <div className="step-body">
                <strong>{step.title}</strong>
                <p>{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="action-box" aria-label="开始方式">
          <span className="action-label">复制下面这句话，发给你的 AI</span>
          <code className="code-line">{agentPrompt}</code>
          <div className="action-row">
            <button type="button" className="primary-btn" onClick={handleCopy}>
              {copied ? '已复制，粘贴给你的 AI 就行' : '复制发给我的 AI'}
            </button>
          </div>
        </section>

        <footer className="meta">
          <p className="privacy">
            你的聊天记录留在你自己的 AI 里。Kindred 不建账号、不收个人资料，只存脱敏后的题目与游戏进度，随时可在对话里让 AI 一键清空。
          </p>
          <nav className="meta-links" aria-label="相关链接">
            <a href="/skill.md" className="meta-link">
              开放协议
            </a>
            <span className="dot" aria-hidden="true">
              ·
            </span>
            <a
              href="https://github.com/amio-love/kindred"
              target="_blank"
              rel="noreferrer"
              className="meta-link"
            >
              GitHub
            </a>
          </nav>
        </footer>
      </article>
    </main>
  )
}
