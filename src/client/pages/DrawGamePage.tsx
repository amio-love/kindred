import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { InteractiveDrawPad, StrokeReplayCanvas } from '../components/StrokeCanvas'
import { MAX_GUESS_ATTEMPTS } from '../../shared/drawing'
import type { DrawGameView, DrawRoundView, Stroke } from '../../shared/types'

const REACTIONS = ['😂 太传神了', '🤯 灵魂画手', '🎯 居然秒懂', '🎨 下轮继续']

export default function DrawGamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const [game, setGame] = useState<DrawGameView | null>(null)
  const [loading, setLoading] = useState(true)
  const [customWord, setCustomWord] = useState('')
  const [drawingBrief, setDrawingBrief] = useState('')
  const [showManualPad, setShowManualPad] = useState(false)
  const [guessInput, setGuessInput] = useState('')
  const [guessFeedback, setGuessFeedback] = useState<string | null>(null)
  const [copiedAgentCmd, setCopiedAgentCmd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    if (!gameId) return
    setLoading(true)
    try {
      const res = await api.getDrawGame(gameId)
      setGame(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载你画我猜失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [gameId])

  if (loading) return <p className="muted">正在打开双人画册…</p>
  if (!game) {
    return (
      <div className="sheet stack-md">
        <h2>找不到这局你画我猜</h2>
        <p className="muted">{error ?? '请确认链接是否正确。'}</p>
        <Link to="/studio" className="btn btn-primary">
          返回工作台
        </Link>
      </div>
    )
  }

  const activeRound: DrawRoundView | undefined =
    game.rounds.find((r) => r.status !== 'revealed') ?? game.rounds[game.rounds.length - 1]
  const revealedRounds = game.rounds.filter((r) => r.status === 'revealed')
  const isDemoPartner = game.partnerHandle.includes('演练')

  const handlePickWord = async (roundId: string, word: string) => {
    if (!gameId || !word.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.pickDrawWord(gameId, roundId, word.trim(), drawingBrief.trim() || undefined)
      setCustomWord('')
      setDrawingBrief('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '选题失败')
    } finally {
      setBusy(false)
    }
  }

  const handleDemoAgentDraw = async (roundId: string) => {
    if (!gameId) return
    setBusy(true)
    setError(null)
    try {
      await api.triggerDemoAgentDraw(gameId, roundId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '示例 Agent 作画失败')
    } finally {
      setBusy(false)
    }
  }

  const handleHumanDraw = async (roundId: string, strokes: Stroke[]) => {
    if (!gameId) return
    setBusy(true)
    setError(null)
    try {
      await api.submitHumanDraw(gameId, roundId, strokes)
      setShowManualPad(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '送出画作失败')
    } finally {
      setBusy(false)
    }
  }

  const handleApprove = async (roundId: string, action: 'approve' | 'redraw') => {
    if (!gameId) return
    setBusy(true)
    setError(null)
    try {
      await api.approveDraw(gameId, roundId, action)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const handleDemoPartnerTurn = async (roundId: string) => {
    if (!gameId) return
    setBusy(true)
    setError(null)
    try {
      await api.triggerDemoPartnerTurn(gameId, roundId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '推进演练回合失败')
    } finally {
      setBusy(false)
    }
  }

  const handleGuess = async (roundId: string, giveUp = false) => {
    if (!gameId) return
    setBusy(true)
    setError(null)
    setGuessFeedback(null)
    try {
      const res = await api.submitGuess(gameId, roundId, guessInput, giveUp)
      setGuessInput('')
      if (!res.revealed) {
        setGuessFeedback(`差一点点！还剩 ${res.attemptsRemaining} 次机会，再看一遍笔迹回放试试。`)
      } else {
        setGuessFeedback(
          res.matched
            ? `猜中了！答案正是「${res.secretWord}」`
            : `揭晓答案：「${res.secretWord}」`,
        )
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交猜测失败')
    } finally {
      setBusy(false)
    }
  }

  const handleReact = async (roundId: string, reaction: string) => {
    if (!gameId) return
    await api.reactDrawRound(gameId, roundId, reaction)
    await refresh()
  }

  const handleExportKeepsake = () => {
    const blob = new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kindred-draw-keepsake-${game.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const agentDrawInstruction = `请调用 GET ${origin}/api/agent/pending 查看我刚选好的 Kindred 你画我猜题目，按 ${origin}/skill.md 第 5 步的 400×400 矢量笔迹格式作画，并通过 POST ${origin}/api/agent/draw 提交。`

  return (
    <div className="stack-lg">
      <section className="sheet stack-sm">
        <div className="row-between">
          <span className="eyebrow">Phase 2 · Agent 代画「你画我猜」</span>
          <span className="badge badge-neutral">
            已完成 {revealedRounds.length} / {game.maxRounds} 轮
          </span>
        </div>
        <h1>你 × {game.partnerHandle} 的双人画册</h1>
        <p className="muted">
          你选词、你的个人 Agent 替你画成逐笔回放的简笔画，告别手绘疲劳；4 轮短局结束自动生成可带走的共同画册。
        </p>
        <div className="row">
          <Link to={`/match/${game.pairingId}`} className="btn btn-subtle btn-sm">
            回看三重默契报告
          </Link>
          {game.status === 'completed' && (
            <button type="button" className="btn btn-sage btn-sm" onClick={handleExportKeepsake}>
              导出共同画册（JSON）
            </button>
          )}
        </div>
      </section>

      {error && <div className="alert alert-error">{error}</div>}
      {guessFeedback && <div className="alert alert-success">{guessFeedback}</div>}

      {game.status === 'active' && activeRound && (
        <section className="sheet stack-md reveal-enter">
          <div className="row-between">
            <h2>
              第 {activeRound.roundNumber} 轮 ·{' '}
              {activeRound.isSelfDrawer
                ? `轮到你出题，由 ${activeRound.drawerAgentName} 作画`
                : `猜一猜 ${activeRound.drawerHandle} 的 Agent（${activeRound.drawerAgentName}）画了什么`}
            </h2>
            <span className="badge badge-stamp">
              {activeRound.status === 'picking_word'
                ? '挑选题目'
                : activeRound.status === 'awaiting_agent_draw'
                  ? '等 Agent 作画'
                  : activeRound.status === 'awaiting_drawer_approve'
                    ? '预览并批准画作'
                    : '等待猜词'}
            </span>
          </div>

          {activeRound.isSelfDrawer && activeRound.status === 'picking_word' && (
            <div className="stack-md">
              <p className="muted">挑一个你想让你的 Agent 替你画给 {game.partnerHandle} 猜的题目：</p>
              <div className="row">
                {(activeRound.promptOptions ?? []).map((word) => (
                  <button
                    key={word}
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => handlePickWord(activeRound.id, word)}
                  >
                    {word}
                  </button>
                ))}
              </div>
              <hr className="divider" />
              <div className="grid-2">
                <label className="stack-xs">
                  <span className="small">或者自己写一个脑洞词</span>
                  <input
                    className="input"
                    placeholder="例如：凌晨三点吃冰棍的企鹅"
                    value={customWord}
                    onChange={(e) => setCustomWord(e.target.value)}
                    maxLength={24}
                  />
                </label>
                <label className="stack-xs">
                  <span className="small">给自家 Agent 的画画叮嘱（可选）</span>
                  <input
                    className="input"
                    placeholder="例如：画得蠢萌一点，千万别写字"
                    value={drawingBrief}
                    onChange={(e) => setDrawingBrief(e.target.value)}
                    maxLength={120}
                  />
                </label>
              </div>
              {customWord.trim() && (
                <div>
                  <button
                    type="button"
                    className="btn btn-stamp"
                    disabled={busy}
                    onClick={() => handlePickWord(activeRound.id, customWord)}
                  >
                    就画「{customWord.trim()}」
                  </button>
                </div>
              )}
            </div>
          )}

          {activeRound.isSelfDrawer && activeRound.status === 'awaiting_agent_draw' && (
            <div className="stack-md">
              <div className="sheet-inset stack-xs">
                <strong>本轮题目：{activeRound.secretWord}</strong>
                {activeRound.drawingBrief && <p className="small">你的叮嘱：{activeRound.drawingBrief}</p>}
              </div>
              <p className="muted">
                把下面指令发给你的个人 Agent（Meta Muse / ChatGPT Dots / Grok Bot），它会把画好的矢量笔迹直接提交到这里，等你亲眼确认后再发给对方：
              </p>
              <div className="code-block">{agentDrawInstruction}</div>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(agentDrawInstruction).catch(() => {})
                    setCopiedAgentCmd(true)
                    setTimeout(() => setCopiedAgentCmd(false), 2000)
                  }}
                >
                  {copiedAgentCmd ? '已复制指令' : '复制指令给我的 Agent'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
                  刷新查看 Agent 是否交画
                </button>
                {isDemoPartner && (
                  <button
                    type="button"
                    className="btn btn-stamp btn-sm"
                    disabled={busy}
                    onClick={() => handleDemoAgentDraw(activeRound.id)}
                  >
                    {busy ? '示例 Agent 作画中…' : '演练：让示例 Agent 立刻画一幅'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-subtle btn-sm"
                  onClick={() => setShowManualPad((v) => !v)}
                >
                  {showManualPad ? '收起手绘板' : '我没接 Agent，自己手绘一幅'}
                </button>
              </div>
              {showManualPad && (
                <InteractiveDrawPad
                  submitting={busy}
                  onSubmit={(strokes) => handleHumanDraw(activeRound.id, strokes)}
                />
              )}
            </div>
          )}

          {activeRound.isSelfDrawer && activeRound.status === 'awaiting_drawer_approve' && activeRound.strokes && (
            <div className="stack-md">
              <p className="muted">
                你的 Agent（{activeRound.drawerAgentName}）已经为「<strong>{activeRound.secretWord}</strong>」画好了！看看笔迹回放够不够传神：
              </p>
              <StrokeReplayCanvas strokes={activeRound.strokes} autoPlay />
              <div className="row">
                <button
                  type="button"
                  className="btn btn-stamp"
                  disabled={busy}
                  onClick={() => handleApprove(activeRound.id, 'approve')}
                >
                  批准，发给 {game.partnerHandle} 猜
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => handleApprove(activeRound.id, 'redraw')}
                >
                  不太像，让 Agent 重画
                </button>
              </div>
            </div>
          )}

          {activeRound.isSelfDrawer && activeRound.status === 'awaiting_guess' && activeRound.strokes && (
            <div className="stack-md">
              <p className="muted">
                这幅「<strong>{activeRound.secretWord}</strong>」已经送到 {game.partnerHandle} 那里了，等 TA 有空上线猜。
              </p>
              <StrokeReplayCanvas strokes={activeRound.strokes} autoPlay={false} />
              {isDemoPartner && (
                <div className="row">
                  <button
                    type="button"
                    className="btn btn-sage"
                    disabled={busy}
                    onClick={() => handleDemoPartnerTurn(activeRound.id)}
                  >
                    {busy ? '推进演练中…' : '演练：模拟对方猜中并让 TA 的 Agent 反画下一轮'}
                  </button>
                </div>
              )}
            </div>
          )}

          {!activeRound.isSelfDrawer && activeRound.status === 'awaiting_guess' && activeRound.strokes && (
            <div className="stack-md">
              <div className="row">
                <span className="badge badge-ochre">
                  字数提示：共 {activeRound.wordLengthHint ?? '?'} 个字
                </span>
                <span className="badge badge-neutral">
                  剩余尝试：{MAX_GUESS_ATTEMPTS - activeRound.guessAttempts} 次
                </span>
              </div>
              <StrokeReplayCanvas strokes={activeRound.strokes} autoPlay />
              <div className="row" style={{ maxWidth: 460, flexWrap: 'nowrap' }}>
                <input
                  className="input"
                  placeholder="输入你猜到的词…"
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && guessInput.trim()) handleGuess(activeRound.id, false)
                  }}
                />
                <button
                  type="button"
                  className="btn btn-stamp"
                  disabled={busy || !guessInput.trim()}
                  onClick={() => handleGuess(activeRound.id, false)}
                >
                  猜这个
                </button>
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => handleGuess(activeRound.id, true)}
                >
                  实在猜不出，直接揭晓答案
                </button>
              </div>
            </div>
          )}

          {!activeRound.isSelfDrawer && activeRound.status !== 'awaiting_guess' && (
            <p className="muted">
              这一轮轮到 {activeRound.drawerHandle} 选题并让 {activeRound.drawerAgentName} 作画，画好后会出现在这里。
            </p>
          )}
        </section>
      )}

      {revealedRounds.length > 0 && (
        <section className="stack-sm">
          <h2>
            {game.status === 'completed' ? '🎉 共同画册已收官（可随时导出带走）' : '已揭晓的画作'}
          </h2>
          <div className="grid-2">
            {revealedRounds.map((round) => (
              <article key={round.id} className="sheet stack-sm">
                <div className="row-between">
                  <strong>
                    第 {round.roundNumber} 轮 · {round.secretWord}
                  </strong>
                  <span className={`badge ${round.isCorrect ? 'badge-sage' : 'badge-ochre'}`}>
                    {round.isCorrect ? '猜中了' : '揭晓'}
                  </span>
                </div>
                {round.strokes && <StrokeReplayCanvas strokes={round.strokes} autoPlay={false} compact />}
                <p className="small">
                  {round.drawerHandle} 出题 · 由{' '}
                  {round.drawnBy === 'agent' ? round.drawerAgentName : '本人手绘'} 作画 ·{' '}
                  {round.guesserHandle} 猜了「{round.guessText}」
                </p>
                {round.reaction ? (
                  <span className="badge badge-neutral">{round.reaction}</span>
                ) : (
                  <div className="row">
                    {REACTIONS.map((label) => (
                      <button
                        key={label}
                        type="button"
                        className="btn btn-subtle btn-sm"
                        onClick={() => handleReact(round.id, label)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
