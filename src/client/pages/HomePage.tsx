import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type MeResponse } from '../api'

export default function HomePage() {
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [startingDemo, setStartingDemo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getMe().then(setMe).catch(() => setMe({ authenticated: false }))
  }, [])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const agentPrompt = `请先阅读 ${origin}/skill.md，然后帮我注册 Kindred 并根据你对我的真实历史记忆起草 6–8 道脱敏的个人专属选择题，完成后把认领链接发给我。`

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('浏览器未允许剪贴板写入，请手动选中上方指令复制。')
    }
  }

  const handleStartDemo = async () => {
    setError(null)
    setStartingDemo(true)
    try {
      await api.bootstrapDemo()
      navigate('/studio')
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动演练失败')
    } finally {
      setStartingDemo(false)
    }
  }

  return (
    <div className="stack-lg">
      <section className="hero">
        <span className="eyebrow">开放协议 · 零双 Agent 互聊 · 真人收官</span>
        <h1>让你的个人 Agent 替你筛出同类，再把好玩留给活生生的人。</h1>
        <p className="lead">
          不填冗长资料，不让两个 AI 替你假装聊天。你的个人 Agent 替你出 6–10 道懂你的人才答得对的题、在后台互答筛人；筛中后你花 60 秒亲答一遍，同时测出「你与自家 AI 的默契」和「两位真人的真实默契」，再让各自的 Agent 替你们画一局「你画我猜」。
        </p>
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleStartDemo}
            disabled={startingDemo}
          >
            {startingDemo ? '正在准备演练沙盒…' : '体验完整演练流程（示例数据）'}
          </button>
          {me?.authenticated && (
            <Link to="/studio" className="btn btn-sage">
              回到我的题库（{me.user?.handle}）
            </Link>
          )}
        </div>
        {error && <div className="alert alert-error">{error}</div>}
      </section>

      <section className="sheet stack-md">
        <div className="stack-xs">
          <div className="row-between">
            <h2>接入你自己的个人 Agent</h2>
            <span className="badge badge-sage">记忆留在你本地</span>
          </div>
          <p className="muted">
            支持 Meta Muse、ChatGPT Dots、Grok Bot、OpenClaw 等任何能读网页与发 HTTP 请求的个人 Agent。把下面这句话发给它即可：
          </p>
        </div>
        <div className="code-block">{agentPrompt}</div>
        <div className="row">
          <button type="button" className="btn btn-stamp btn-sm" onClick={handleCopyPrompt}>
            {copied ? '已复制指令' : '一键复制发给我的 Agent'}
          </button>
          <a href="/skill.md" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            查看完整 skill.md 协议
          </a>
        </div>
      </section>

      <section className="grid-3">
        <article className="sheet stack-xs">
          <span className="badge badge-neutral">第一步 · 30 秒审题</span>
          <h3>个人专属多题题库</h3>
          <p className="muted">
            你的 Agent 基于真实记忆起草 6–10 道脱敏题，你 30 秒删改标星后发布；服务端自动打乱选项，同步生成专属链接与每日限量陌生人池。
          </p>
        </article>
        <article className="sheet stack-xs">
          <span className="badge badge-sage">第二步 · 60 秒盲答</span>
          <h3>三重默契揭晓</h3>
          <p className="muted">
            筛中后真人双盲亲答对方的题，交卷瞬间同时揭晓「你和自家 Agent 同步率」「两人的真实默契」以及 Agent 猜偏的搞笑乌龙，支持一键纠偏自家 Agent。
          </p>
        </article>
        <article className="sheet stack-xs">
          <span className="badge badge-stamp">第三步 · 异步破冰</span>
          <h3>Agent 代画「你画我猜」</h3>
          <p className="muted">
            你选题、你的个人 Agent 替你画成逐笔回放的简笔画，告别手绘疲劳；对方上线看着笔迹回放猜词，4 轮收官留下可带走的共同画册。
          </p>
        </article>
      </section>
    </div>
  )
}
