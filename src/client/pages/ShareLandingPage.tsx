import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'

export default function ShareLandingPage() {
  const { shareCode } = useParams<{ shareCode: string }>()
  const navigate = useNavigate()
  const [info, setInfo] = useState<{
    ownerHandle: string
    ownerAgentName: string
    questionCount: number
    dimensions: string[]
    isOwnLink: boolean
    viewerHandle: string | null
  } | null>(null)
  const [handle, setHandle] = useState('')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!shareCode) return
    api
      .getShareInfo(shareCode)
      .then((res) => {
        setInfo(res)
        if (res.viewerHandle) setHandle(res.viewerHandle)
      })
      .catch((err) => setError(err instanceof Error ? err.message : '链接无效'))
      .finally(() => setLoading(false))
  }, [shareCode])

  const handleStart = async () => {
    if (!shareCode) return
    setStarting(true)
    setError(null)
    try {
      const res = await api.startShareChallenge(shareCode, handle.trim() || undefined)
      navigate(`/match/${res.pairingId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '开启互测失败')
    } finally {
      setStarting(false)
    }
  }

  if (loading) return <p className="muted">正在读取专属题库…</p>

  if (!info) {
    return (
      <div className="sheet stack-md" style={{ maxWidth: 520, margin: '24px auto' }}>
        <h2>找不到这份个人题库</h2>
        <p className="muted">{error ?? '链接可能已过期或对方已删除题库。'}</p>
        <Link to="/" className="btn btn-primary">
          返回首页
        </Link>
      </div>
    )
  }

  return (
    <div className="sheet stack-md" style={{ maxWidth: 560, margin: '24px auto' }}>
      <span className="eyebrow">专属个人题库互测</span>
      <h1>{info.ownerHandle} 邀请你答 TA 的 {info.questionCount} 道专属题</h1>
      <p className="muted">
        这套题由 {info.ownerHandle} 的个人 Agent（{info.ownerAgentName}）基于真实记忆起草、经本人确认发布。不需要安装或接入个人 Agent，花 60 秒亲答一遍就能立刻看到你们的真实默契报告，并继续玩一局「你画我猜」。
      </p>
      <div className="row">
        {info.dimensions.map((dim) => (
          <span key={dim} className="badge badge-neutral">
            {dim}
          </span>
        ))}
      </div>

      {info.isOwnLink ? (
        <div className="alert alert-info">
          这是你自己的专属链接。把它发给朋友或发到社区，对方打开就能直接测你们的默契。
        </div>
      ) : (
        <>
          {!info.viewerHandle && (
            <label className="stack-xs">
              <span className="small">给自己起一个临时昵称（无需注册）</span>
              <input
                className="input"
                placeholder="例如：周日夜猫子"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                maxLength={24}
              />
            </label>
          )}
          {error && <div className="alert alert-error">{error}</div>}
          <div className="row">
            <button
              type="button"
              className="btn btn-stamp"
              disabled={starting}
              onClick={handleStart}
            >
              {starting ? '正在开启双盲题卷…' : '开始 60 秒盲答'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
