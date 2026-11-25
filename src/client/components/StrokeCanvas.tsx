import { useEffect, useRef, useState } from 'react'
import { CANVAS_SIZE } from '../../shared/drawing'
import type { Stroke } from '../../shared/types'

const INK_PALETTE = ['#1F1D1A', '#C84B31', '#2E6B55', '#D99B26', '#3B6EA5', '#8B5E83']

interface ReplayCanvasProps {
  strokes: Stroke[]
  autoPlay?: boolean
  compact?: boolean
}

function drawStrokeSegment(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  pointLimit: number,
) {
  if (stroke.points.length < 2 || pointLimit < 2) return
  ctx.save()
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const first = stroke.points[0]!
  ctx.moveTo(first[0], first[1])
  const count = Math.min(stroke.points.length, pointLimit)
  for (let i = 1; i < count; i++) {
    const pt = stroke.points[i]!
    ctx.lineTo(pt[0], pt[1])
  }
  ctx.stroke()
  ctx.restore()
}

function paintPaper(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#FFFDF8'
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  ctx.strokeStyle = 'rgba(31, 29, 26, 0.045)'
  ctx.lineWidth = 1
  for (let y = 40; y < CANVAS_SIZE; y += 40) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(CANVAS_SIZE, y)
    ctx.stroke()
  }
}

export function StrokeReplayCanvas({ strokes, autoPlay = true, compact = false }: ReplayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [replaySeed, setReplaySeed] = useState(0)
  const [progress, setProgress] = useState({ strokeIndex: strokes.length, done: true })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!autoPlay || reducedMotion || compact || strokes.length === 0) {
      paintPaper(ctx)
      for (const stroke of strokes) {
        drawStrokeSegment(ctx, stroke, stroke.points.length)
      }
      setProgress({ strokeIndex: strokes.length, done: true })
      return
    }

    let rafId = 0
    let strokeIdx = 0
    let pointIdx = 2
    let lastTick = 0
    const stepMs = 45

    const frame = (ts: number) => {
      if (ts - lastTick >= stepMs) {
        lastTick = ts
        paintPaper(ctx)
        for (let i = 0; i < strokeIdx; i++) {
          const doneStroke = strokes[i]
          if (doneStroke) drawStrokeSegment(ctx, doneStroke, doneStroke.points.length)
        }
        const current = strokes[strokeIdx]
        if (current) {
          drawStrokeSegment(ctx, current, pointIdx)
          if (pointIdx < current.points.length) {
            pointIdx++
          } else {
            strokeIdx++
            pointIdx = 2
          }
          setProgress({ strokeIndex: Math.min(strokeIdx + 1, strokes.length), done: false })
        }
      }

      if (strokeIdx < strokes.length) {
        rafId = requestAnimationFrame(frame)
      } else {
        paintPaper(ctx)
        for (const stroke of strokes) {
          drawStrokeSegment(ctx, stroke, stroke.points.length)
        }
        setProgress({ strokeIndex: strokes.length, done: true })
      }
    }

    rafId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafId)
  }, [strokes, autoPlay, compact, replaySeed])

  return (
    <div className="stack-xs">
      <div className="sketch-frame" style={compact ? { maxWidth: 220 } : undefined}>
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="sketch-canvas"
          aria-label="画作回放画布"
        />
      </div>
      {!compact && (
        <div className="row-between" style={{ maxWidth: 420 }}>
          <span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {progress.done ? `共 ${strokes.length} 笔` : `正在回放 ${progress.strokeIndex} / ${strokes.length} 笔`}
          </span>
          <button
            type="button"
            className="btn btn-subtle btn-sm"
            onClick={() => setReplaySeed((n) => n + 1)}
          >
            重播笔迹
          </button>
        </div>
      )}
    </div>
  )
}

interface DrawPadProps {
  onSubmit: (strokes: Stroke[]) => void
  submitting?: boolean
}

export function InteractiveDrawPad({ onSubmit, submitting = false }: DrawPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [color, setColor] = useState(INK_PALETTE[0]!)
  const [width, setWidth] = useState(5)
  const activeStrokeRef = useRef<Stroke | null>(null)

  const redraw = (list: Stroke[], active: Stroke | null) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    paintPaper(ctx)
    for (const s of list) drawStrokeSegment(ctx, s, s.points.length)
    if (active) drawStrokeSegment(ctx, active, active.points.length)
  }

  useEffect(() => {
    redraw(strokes, activeStrokeRef.current)
  }, [strokes])

  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE
    return [
      Math.round(Math.min(CANVAS_SIZE, Math.max(0, x)) * 10) / 10,
      Math.round(Math.min(CANVAS_SIZE, Math.max(0, y)) * 10) / 10,
    ]
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const pt = toCanvasPoint(e)
    activeStrokeRef.current = { color, width, points: [pt, pt] }
    redraw(strokes, activeStrokeRef.current)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const active = activeStrokeRef.current
    if (!active) return
    const pt = toCanvasPoint(e)
    const prev = active.points[active.points.length - 1]
    if (prev && Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) < 4) return
    if (active.points.length < 118) {
      active.points.push(pt)
      redraw(strokes, active)
    }
  }

  const handlePointerUp = () => {
    const active = activeStrokeRef.current
    if (!active) return
    activeStrokeRef.current = null
    if (active.points.length >= 2) {
      setStrokes((prev) => [...prev.slice(-59), active])
    }
  }

  return (
    <div className="stack-sm">
      <div className="sketch-frame">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="sketch-canvas"
          aria-label="手绘兜底画板"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
      <div className="row-between" style={{ maxWidth: 420 }}>
        <div className="swatch-row">
          {INK_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              className={`swatch ${color === hex ? 'swatch--active' : ''}`}
              style={{ background: hex }}
              aria-label={`画笔颜色 ${hex}`}
              onClick={() => setColor(hex)}
            />
          ))}
          <select
            aria-label="画笔粗细"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className="input"
            style={{ width: 'auto', minHeight: 32, padding: '4px 8px' }}
          >
            <option value={3}>细</option>
            <option value={5}>中</option>
            <option value={9}>粗</option>
          </select>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn btn-subtle btn-sm"
            disabled={strokes.length === 0}
            onClick={() => setStrokes((prev) => prev.slice(0, -1))}
          >
            撤销一笔
          </button>
          <button
            type="button"
            className="btn btn-subtle btn-sm"
            disabled={strokes.length === 0}
            onClick={() => setStrokes([])}
          >
            清空
          </button>
        </div>
      </div>
      <div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={strokes.length === 0 || submitting}
          onClick={() => onSubmit(strokes)}
        >
          {submitting ? '正在送出画作…' : '送出这幅画让对方猜'}
        </button>
      </div>
    </div>
  )
}
