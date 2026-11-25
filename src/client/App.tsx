import { useEffect, useState } from 'react'
import { KINDRED_TOOLS } from '../shared/mcpTools'
import { registerKindredWebMcp, type WebMcpState } from './webmcp'

export default function App() {
  const [copiedTarget, setCopiedTarget] = useState<'prompt' | 'mcp' | null>(null)
  const [webMcp, setWebMcp] = useState<WebMcpState>({
    supported: false,
    surface: 'none',
    registeredCount: 0,
  })

  useEffect(() => {
    const reg = registerKindredWebMcp()
    setWebMcp(reg.state)
    return reg.cleanup
  }, [])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const skillUrl = `${origin}/skill.md`
  const mcpUrl = `${origin}/mcp`
  const agentPrompt = `请先阅读 ${skillUrl}，然后在当前对话里带我开始 Kindred。`

  const copyText = async (target: 'prompt' | 'mcp', value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedTarget(target)
      setTimeout(() => setCopiedTarget((prev) => (prev === target ? null : prev)), 1800)
    } catch {
      setCopiedTarget(null)
    }
  }

  return (
    <main className="shell">
      <section className="card">
        <header className="hero">
          <div className="wordmark">Kindred</div>
          <h1>让你的个人 Agent 替你找到同类。</h1>
          <p className="subtitle">
            把链接发给你的 Agent，出题、筛选、双盲揭晓与你画我猜全在对话里完成。无网页账号，不存个人资料。
          </p>
        </header>

        <div className="entries">
          <div className="entry">
            <div className="entry-head">
              <span className="entry-label">发给你的 Agent</span>
              <button
                type="button"
                className="copy-btn copy-btn--primary"
                onClick={() => copyText('prompt', agentPrompt)}
              >
                {copiedTarget === 'prompt' ? '已复制' : '复制指令'}
              </button>
            </div>
            <code className="code-line">{agentPrompt}</code>
          </div>

          <div className="entry">
            <div className="entry-head">
              <span className="entry-label">MCP · Streamable HTTP</span>
              <button
                type="button"
                className="copy-btn"
                onClick={() => copyText('mcp', mcpUrl)}
              >
                {copiedTarget === 'mcp' ? '已复制' : '复制地址'}
              </button>
            </div>
            <code className="code-line">{mcpUrl}</code>
          </div>
        </div>

        <footer className="meta">
          <a href="/skill.md" className="meta-link">
            skill.md
          </a>
          <span className="dot" aria-hidden="true">·</span>
          <a
            href="https://github.com/amio-love/kindred"
            target="_blank"
            rel="noreferrer"
            className="meta-link"
          >
            GitHub
          </a>
          <span className="dot" aria-hidden="true">·</span>
          <span className="webmcp-pill">
            {webMcp.supported
              ? `WebMCP 已注册 ${webMcp.registeredCount} 个工具`
              : `WebMCP 就绪（${KINDRED_TOOLS.length} tools）`}
          </span>
        </footer>
      </section>
    </main>
  )
}
