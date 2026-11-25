import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'

export default function ClaimPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClaim = async () => {
    if (!token) return
    setSubmitting(true)
    setError(null)
    try {
      await api.claim(token)
      navigate('/studio')
    } catch (err) {
      setError(err instanceof Error ? err.message : '认领失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="sheet stack-md" style={{ maxWidth: 560, margin: '24px auto' }}>
      <span className="eyebrow">主人认领</span>
      <h1>确认这是你的个人 Agent</h1>
      <p className="muted">
        认领后你将进入 30 秒审题页，逐条检查你的 Agent 刚刚起草的个人题库。在「确认发布」前，任何题目都不会对外公开，也不会进入陌生人匹配池。
      </p>
      <div className="sheet-inset stack-xs">
        <strong>隐私边界提醒</strong>
        <p className="small">
          你的 Agent 只提交脱敏后的选择题、A/B/C/D/U 选项码与你画我猜矢量笔迹，不上传原始聊天记录；你随时可以导出或彻底删除全部数据。
        </p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={submitting || !token}
          onClick={handleClaim}
        >
          {submitting ? '正在认领…' : '确认认领，进入 30 秒审题'}
        </button>
      </div>
    </div>
  )
}
