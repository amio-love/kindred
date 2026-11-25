import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type MeResponse } from '../api'
import { OPTION_KEYS } from '../../shared/quiz'
import type { OptionKey, StoredQuestion } from '../../shared/types'

export default function StudioPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<StoredQuestion[]>([])
  const [handle, setHandle] = useState('')
  const [poolOptedIn, setPoolOptedIn] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copiedShare, setCopiedShare] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await api.getMe()
      setData(res)
      if (res.authenticated && res.user) {
        setHandle(res.user.handle)
        setPoolOptedIn(res.user.poolOptedIn)
        setDrafts(res.questions ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取工作台失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  if (loading) {
    return <p className="muted">正在读取你的个人题库与相遇记录…</p>
  }

  if (!data?.authenticated || !data.user) {
    return (
      <div className="sheet stack-md" style={{ maxWidth: 560, margin: '24px auto' }}>
        <h2>还没有认领的个人 Agent</h2>
        <p className="muted">
          把首页的 <code>skill.md</code> 指令发给你的 Meta Muse / ChatGPT Dots / Grok Bot，拿到认领链接即可进入；或者先跑一次 30 秒完整演练。
        </p>
        <div className="row">
          <Link to="/" className="btn btn-primary">
            回到首页接入或演练
          </Link>
        </div>
      </div>
    )
  }

  const hasUnapproved = drafts.some((q) => !q.approved)
  const approvedCount = drafts.filter((q) => q.approved).length

  const updateDraft = (id: string, patch: Partial<StoredQuestion>) => {
    setDrafts((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }

  const updateOption = (id: string, key: OptionKey, value: string) => {
    setDrafts((prev) =>
      prev.map((q) => (q.id === id ? { ...q, options: { ...q.options, [key]: value } } : q)),
    )
  }

  const removeDraft = (id: string) => {
    setDrafts((prev) => prev.filter((q) => q.id !== id))
  }

  const handlePublish = async () => {
    setError(null)
    setMessage(null)
    setSaving(true)
    try {
      const res = await api.approveQuiz({
        handle,
        poolOptedIn,
        questions: drafts.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options,
          ownerChoice: q.ownerChoice,
          starred: q.starred,
        })),
      })
      setMessage(`已发布 ${res.approvedCount} 道个人专属题！专属链接已生效，并已进入互答队列。`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyShare = async () => {
    if (!data.user) return
    try {
      await navigator.clipboard.writeText(data.user.shareUrl)
      setCopiedShare(true)
      setTimeout(() => setCopiedShare(false), 2000)
    } catch {
      setError('剪贴板复制失败，请手动复制下方链接。')
    }
  }

  const handleExport = async () => {
    try {
      const dump = await api.exportMe()
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kindred-export-${data.user?.shareCode ?? 'me'}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    }
  }

  const handleDeleteAccount = async () => {
    try {
      await api.deleteMe()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  return (
    <div className="stack-lg">
      <section className="sheet stack-md">
        <div className="row-between">
          <div className="stack-xs">
            <span className="eyebrow">
              {data.user.agentName} · {data.user.agentHost}
            </span>
            <h1>{data.user.handle} 的题库与相遇</h1>
          </div>
          <div className="row">
            <button type="button" className="btn btn-subtle btn-sm" onClick={handleExport}>
              导出全部数据
            </button>
            {!confirmDelete ? (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setConfirmDelete(true)}
              >
                彻底删除账号
              </button>
            ) : (
              <button type="button" className="btn btn-stamp btn-sm" onClick={handleDeleteAccount}>
                确认永久删除（不可撤销）
              </button>
            )}
          </div>
        </div>

        {approvedCount > 0 && (
          <div className="sheet-inset row-between">
            <div className="stack-xs">
              <strong>专属互测链接（发给朋友或陌生人，无 Agent 也能直接答）</strong>
              <code className="small">{data.user.shareUrl}</code>
            </div>
            <div className="row">
              <button type="button" className="btn btn-primary btn-sm" onClick={handleCopyShare}>
                {copiedShare ? '已复制链接' : '复制专属链接'}
              </button>
              <Link to={`/q/${data.user.shareCode}`} className="btn btn-ghost btn-sm">
                预览链接页
              </Link>
            </div>
          </div>
        )}
      </section>

      {(data.pairings?.length ?? 0) > 0 && (
        <section className="stack-sm">
          <h2>相遇与待亲答匹配</h2>
          <div className="grid-2">
            {data.pairings!.map((pairing) => {
              const linkedDraw = data.drawGames?.find((g) => g.pairingId === pairing.id)
              return (
                <article key={pairing.id} className="sheet stack-sm">
                  <div className="row-between">
                    <strong>{pairing.partnerHandle}</strong>
                    <span
                      className={`badge ${
                        pairing.status === 'revealed'
                          ? 'badge-sage'
                          : pairing.status === 'ready_for_humans'
                            ? 'badge-stamp'
                            : 'badge-neutral'
                      }`}
                    >
                      {pairing.status === 'revealed'
                        ? '三重默契已揭晓'
                        : pairing.status === 'ready_for_humans'
                          ? pairing.selfSubmitted
                            ? '已提交，等对方亲答'
                            : '待你 60 秒双盲亲答'
                          : 'Agent 后台互答中'}
                    </span>
                  </div>
                  <p className="small">
                    对方 Agent：{pairing.partnerAgentName} ·{' '}
                    {pairing.kind === 'pool' ? '陌生人限量池' : '专属链接互测'}
                  </p>
                  <div className="row">
                    <Link
                      to={`/match/${pairing.id}`}
                      className={`btn btn-sm ${
                        pairing.status === 'ready_for_humans' && !pairing.selfSubmitted
                          ? 'btn-stamp'
                          : 'btn-primary'
                      }`}
                    >
                      {pairing.status === 'revealed'
                        ? '查看三重默契与锚点'
                        : pairing.selfSubmitted
                          ? '查看我与自家 AI 体检'
                          : '开始 60 秒双盲亲答'}
                    </Link>
                    {linkedDraw && (
                      <Link to={`/draw/${linkedDraw.id}`} className="btn btn-sage btn-sm">
                        {linkedDraw.isMyTurn ? '轮到你 · 你画我猜' : '进入你画我猜'}（{linkedDraw.revealedRounds}/{linkedDraw.maxRounds}）
                      </Link>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section className="sheet stack-md">
        <div className="row-between">
          <div className="stack-xs">
            <h2>{hasUnapproved ? '30 秒审阅并发布个人题库' : '我的个人专属题库'}</h2>
            <p className="muted">
              删掉不像你的题、给最在意的 1–2 道核心题标星，确认无隐私信息后发布。
            </p>
          </div>
          <span className="badge badge-neutral">当前 {drafts.length} 题</span>
        </div>

        <div className="grid-2">
          <label className="stack-xs">
            <span className="small">我的对外昵称</span>
            <input
              className="input"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              maxLength={24}
            />
          </label>
          <label className="row" style={{ alignSelf: 'end', minHeight: 42 }}>
            <input
              type="checkbox"
              checked={poolOptedIn}
              onChange={(e) => setPoolOptedIn(e.target.checked)}
            />
            <span>加入每日限量陌生人池（每天至多配对 3 位候选）</span>
          </label>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        {drafts.length === 0 ? (
          <div className="sheet-inset">
            <p className="muted">
              当前还没有草稿题目。请让你的个人 Agent 调用 <code>POST /api/agent/quiz</code> 提交 6–10 道专属题。
            </p>
          </div>
        ) : (
          <div className="stack-md">
            {drafts.map((q, index) => (
              <article key={q.id} className="sheet-inset stack-sm">
                <div className="row-between">
                  <div className="row">
                    <strong>第 {index + 1} 题</strong>
                    <span className="badge badge-neutral">{q.dimension}</span>
                    <span
                      className={`badge ${
                        q.confidence === 'high'
                          ? 'badge-sage'
                          : q.confidence === 'low'
                            ? 'badge-stamp'
                            : 'badge-ochre'
                      }`}
                    >
                      记忆置信度：{q.confidence}
                    </span>
                  </div>
                  <div className="row">
                    <button
                      type="button"
                      className={`btn btn-sm ${q.starred ? 'btn-stamp' : 'btn-ghost'}`}
                      onClick={() => updateDraft(q.id, { starred: !q.starred })}
                    >
                      {q.starred ? '★ 核心题' : '☆ 标为核心'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={drafts.length <= 3}
                      onClick={() => removeDraft(q.id)}
                    >
                      删去
                    </button>
                  </div>
                </div>

                {q.memoryBasis && (
                  <p className="small">
                    记忆依据（仅自己可见，绝不公开）：{q.memoryBasis}
                  </p>
                )}

                <input
                  className="input"
                  aria-label={`第 ${index + 1} 题题干`}
                  value={q.prompt}
                  onChange={(e) => updateDraft(q.id, { prompt: e.target.value })}
                />

                <div className="option-grid">
                  {OPTION_KEYS.map((key) => (
                    <div key={key} className="row" style={{ flexWrap: 'nowrap' }}>
                      <button
                        type="button"
                        className={`option-key ${q.ownerChoice === key ? 'btn-primary' : ''}`}
                        style={{ border: 'none', width: 32, height: 32 }}
                        title="设为我的标准答案"
                        onClick={() => updateDraft(q.id, { ownerChoice: key })}
                      >
                        {key}
                      </button>
                      <input
                        className="input"
                        aria-label={`第 ${index + 1} 题选项 ${key}`}
                        value={q.options[key]}
                        onChange={(e) => updateOption(q.id, key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <p className="small">
                  当前我的标准答案：<strong>{q.ownerChoice}</strong>（点击左侧字母按钮可改选）
                </p>
              </article>
            ))}

            <div className="row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || drafts.length < 3}
                onClick={handlePublish}
              >
                {saving ? '正在发布…' : hasUnapproved ? '确认并发布个人题库' : '保存题库修改'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
