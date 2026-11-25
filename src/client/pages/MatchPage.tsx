import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type PairingViewResponse } from '../api'
import { OPTION_KEYS } from '../../shared/quiz'
import type { OptionKey } from '../../shared/types'

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${Math.round(value * 100)}%`
}

export default function MatchPage() {
  const { pairingId } = useParams<{ pairingId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<PairingViewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, OptionKey>>({})
  const [submitting, setSubmitting] = useState(false)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [copiedCalibration, setCopiedCalibration] = useState(false)
  const [startingDraw, setStartingDraw] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    if (!pairingId) return
    setLoading(true)
    try {
      const res = await api.getPairing(pairingId)
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取匹配失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [pairingId])

  const handleSubmitAnswers = async () => {
    if (!pairingId || !data?.partnerQuestions) return
    setError(null)
    setSubmitting(true)
    try {
      const payload = data.partnerQuestions.map((q) => ({
        questionId: q.id,
        choice: answers[q.id]!,
      }))
      await api.submitHumanAnswers(pairingId, payload)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendNote = async (questionId: string) => {
    if (!pairingId) return
    const text = (noteDrafts[questionId] ?? '').trim()
    if (!text) return
    setError(null)
    try {
      await api.postAnchorNote(pairingId, questionId, text)
      setNoteDrafts((prev) => ({ ...prev, [questionId]: '' }))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送留言失败')
    }
  }

  const handleStartDrawGame = async () => {
    if (!pairingId) return
    setStartingDraw(true)
    setError(null)
    try {
      const res = await api.startDrawGame(pairingId)
      navigate(`/draw/${res.gameId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '开启你画我猜失败')
    } finally {
      setStartingDraw(false)
    }
  }

  const handleArchive = async () => {
    if (!pairingId) return
    await api.archivePairing(pairingId)
    navigate('/studio')
  }

  const copyCalibration = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCalibration(true)
      setTimeout(() => setCopiedCalibration(false), 2000)
    } catch {
      setError('剪贴板复制失败，请手动选中复制。')
    }
  }

  if (loading) return <p className="muted">正在加载双盲题卷…</p>
  if (!data) {
    return (
      <div className="sheet stack-md">
        <h2>无法打开这份相遇</h2>
        <p className="muted">{error ?? '你可能没有权限查看该匹配。'}</p>
        <Link to="/studio" className="btn btn-primary">
          返回工作台
        </Link>
      </div>
    )
  }

  if (data.phase === 'blind_answering' && data.partnerQuestions) {
    const answeredCount = Object.keys(answers).length
    const totalCount = data.partnerQuestions.length
    const ready = answeredCount === totalCount

    return (
      <div className="stack-lg">
        <section className="sheet stack-sm">
          <div className="row-between">
            <span className="eyebrow">双盲亲答 · 严防剧透</span>
            <span className="badge badge-neutral">
              已完成 {answeredCount} / {totalCount}
            </span>
          </div>
          <h1>亲答 {data.partnerHandle} 的 {totalCount} 道个人专属题</h1>
          <p className="muted">
            {data.hasOwnAgentAnswers
              ? `你的个人 Agent（${data.selfAgentName}）已在后台替你答完这套题，但交卷前已严格隐藏。按你自己的真实直觉选，交卷瞬间同时揭晓「你 ↔ 自家 AI 同步率」与「两位真人的真实默契」。`
              : `按你自己的真实直觉选完这 ${totalCount} 道题，交卷后立刻揭晓你们的真实默契报告。`}
          </p>
        </section>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="stack-md">
          {data.partnerQuestions.map((q, index) => (
            <article key={q.id} className="sheet stack-sm">
              <div className="row">
                <span className="badge badge-neutral">
                  {index + 1} / {totalCount} · {q.dimension}
                </span>
                {q.starred && <span className="badge badge-stamp">★ 对方核心题</span>}
              </div>
              <h3>{q.prompt}</h3>
              <div className="option-grid">
                {OPTION_KEYS.map((key) => {
                  const selected = answers[q.id] === key
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`option-btn ${selected ? 'option-btn--selected' : ''}`}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: key }))}
                    >
                      <span className="option-key">{key}</span>
                      <span>{q.options[key]}</span>
                    </button>
                  )
                })}
              </div>
            </article>
          ))}
        </div>

        <div className="row-between">
          <button type="button" className="btn btn-ghost" onClick={handleArchive}>
            暂不想答（静默收起）
          </button>
          <button
            type="button"
            className="btn btn-stamp"
            disabled={!ready || submitting}
            onClick={handleSubmitAnswers}
          >
            {submitting
              ? '正在揭晓三重默契…'
              : ready
                ? '交卷，立即揭晓三重默契'
                : `还差 ${totalCount - answeredCount} 题未选`}
          </button>
        </div>
      </div>
    )
  }

  if (data.phase === 'waiting_partner') {
    const sync = data.ownAgentSync
    return (
      <div className="stack-lg reveal-enter">
        <section className="sheet stack-md">
          <span className="eyebrow">已交卷 · 等待对方亲答</span>
          <h1>你已完成盲答，等 {data.partnerHandle} 有空交卷后双方同时解锁</h1>
          <p className="muted">
            无倒计时催促，对方交卷后会一起揭晓双人完整默契。在那之前，你已经可以先看看「你和自家 Agent 的同步体检」。
          </p>
        </section>

        {sync && sync.comparableCount > 0 && (
          <section className="sheet stack-md">
            <div className="row-between">
              <h2>你与 {data.selfAgentName} 的默契体检</h2>
              <span className="badge badge-sage">同步率 {formatPercent(sync.syncRate)}</span>
            </div>
            <p className="muted">
              在 {sync.comparableCount} 道非弃权题里，你的 Agent 有 {sync.matchedCount} 题和你本人选得一模一样（另诚实弃权 {sync.abstainedCount} 题）。
            </p>
            {sync.calibrationPrompt && (
              <div className="stack-xs">
                <div className="code-block">{sync.calibrationPrompt}</div>
                <button
                  type="button"
                  className="btn btn-subtle btn-sm"
                  onClick={() => copyCalibration(sync.calibrationPrompt!)}
                >
                  {copiedCalibration ? '已复制纠偏反馈' : '复制发回给我的 Agent 校准记忆'}
                </button>
              </div>
            )}
          </section>
        )}

        <Link to="/studio" className="btn btn-ghost">
          返回工作台
        </Link>
      </div>
    )
  }

  const reveal = data.tripleReveal!
  const sync = reveal.ownAgentSync
  const notesByQuestion = new Map<string, typeof data.notes>()
  for (const note of data.notes ?? []) {
    const list = notesByQuestion.get(note.questionId) ?? []
    list.push(note)
    notesByQuestion.set(note.questionId, list)
  }

  return (
    <div className="stack-lg reveal-enter">
      <section className="sheet stack-md">
        <div className="row-between">
          <span className="eyebrow">三重默契揭晓</span>
          <span className="badge badge-sage">
            {data.selfHandle} × {data.partnerHandle}
          </span>
        </div>
        <h1>从 Agent 筛选到真人验证，这是你们的真实默契报告</h1>

        <div className="grid-3">
          <div className="metric-card">
            <span className="metric-value" style={{ color: 'var(--sage)' }}>
              {formatPercent(reveal.humanToHuman.combinedHitRate)}
            </span>
            <span className="metric-label">两位真人的真实默契度</span>
            <span className="small">
              你答中 TA {reveal.humanToHuman.selfOnPartner.matched}/{reveal.humanToHuman.selfOnPartner.answered}
              {reveal.humanToHuman.partnerOnSelf.answered > 0
                ? ` · TA 答中你 ${reveal.humanToHuman.partnerOnSelf.matched}/${reveal.humanToHuman.partnerOnSelf.answered}`
                : ''}
            </span>
          </div>

          <div className="metric-card">
            <span className="metric-value" style={{ color: 'var(--stamp)' }}>
              {formatPercent(sync.syncRate)}
            </span>
            <span className="metric-label">你 ↔ {data.selfAgentName} 同步率</span>
            <span className="small">
              {sync.comparableCount > 0
                ? `猜中 ${sync.matchedCount}/${sync.comparableCount} · 诚实弃权 ${sync.abstainedCount} 题`
                : '本次为无外接 Agent 亲答'}
            </span>
          </div>

          <div className="metric-card">
            <span className="metric-value">
              {formatPercent(reveal.agentPrediction.selfAgentHitRate)}
            </span>
            <span className="metric-label">初筛时 Agent 预估重合</span>
            <span className="small">用来对照 AI 代理是否产生过偏差</span>
          </div>
        </div>

        <div className="row-between">
          <div className="row">
            {data.drawGameId ? (
              <Link to={`/draw/${data.drawGameId}`} className="btn btn-stamp">
                继续 Phase 2 · Agent 代画「你画我猜」
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-stamp"
                disabled={startingDraw}
                onClick={handleStartDrawGame}
              >
                {startingDraw ? '正在开局…' : '开启 Phase 2 · 让 Agent 替你们画一局「你画我猜」'}
              </button>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleArchive}>
            先到这里（静默离开，不通知对方）
          </button>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
      </section>

      {sync.mismatches.length > 0 && sync.calibrationPrompt && (
        <section className="sheet stack-sm">
          <div className="row-between">
            <h2>你的 Agent 有 {sync.mismatches.length} 题猜偏了，顺手校准一下？</h2>
            <button
              type="button"
              className="btn btn-subtle btn-sm"
              onClick={() => copyCalibration(sync.calibrationPrompt!)}
            >
              {copiedCalibration ? '已复制校准反馈' : '一键复制发给我的 Agent'}
            </button>
          </div>
          <div className="code-block">{sync.calibrationPrompt}</div>
        </section>
      )}

      <section className="stack-sm">
        <h2>逐题锚点对比（对着具体某道题随手留一句，不必尬聊）</h2>
        <div className="stack-md">
          {reveal.items.map((item) => {
            const qNotes = notesByQuestion.get(item.questionId) ?? []
            const authorLabel = item.quizOwnerSide === 'partner' ? data.partnerHandle : data.selfHandle
            const respondentLabel = item.quizOwnerSide === 'partner' ? '你' : data.partnerHandle
            return (
              <article key={item.questionId} className="sheet stack-sm">
                <div className="row-between">
                  <div className="row">
                    <span className="badge badge-neutral">
                      {authorLabel} 出题 · {item.dimension}
                    </span>
                    {item.humanMatched ? (
                      <span className="badge badge-sage">真人命中</span>
                    ) : (
                      <span className="badge badge-ochre">真人分歧</span>
                    )}
                    {item.agentAgreedWithHuman === false && (
                      <span className="badge badge-stamp">AI 乌龙</span>
                    )}
                  </div>
                </div>
                <h3>{item.prompt}</h3>
                <div className="sheet-inset stack-xs">
                  <p className="small">
                    <strong>{authorLabel} 的答案：</strong>
                    {item.authorChoice}. {item.options[item.authorChoice]}
                  </p>
                  <p className="small">
                    <strong>{respondentLabel} 亲选：</strong>
                    {item.respondentHumanChoice
                      ? `${item.respondentHumanChoice}. ${item.options[item.respondentHumanChoice]}`
                      : '未答'}
                  </p>
                  {item.respondentAgentChoice && (
                    <p className="small">
                      <strong>{respondentLabel}的 Agent 猜：</strong>
                      {item.respondentAgentChoice === 'U'
                        ? 'U（诚实弃权）'
                        : `${item.respondentAgentChoice}. ${item.options[item.respondentAgentChoice]}`}
                      {item.respondentAgentReason ? ` — ${item.respondentAgentReason}` : ''}
                    </p>
                  )}
                </div>

                {qNotes.length > 0 && (
                  <div className="stack-xs">
                    {qNotes.map((n) => (
                      <div key={n.id} className="small">
                        <strong>{n.authorHandle}：</strong>
                        {n.body}
                      </div>
                    ))}
                  </div>
                )}

                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input
                    className="input"
                    placeholder="对着这道题留一句吐槽或回应…"
                    value={noteDrafts[item.questionId] ?? ''}
                    onChange={(e) =>
                      setNoteDrafts((prev) => ({ ...prev, [item.questionId]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendNote(item.questionId)
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    onClick={() => handleSendNote(item.questionId)}
                  >
                    留言
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
