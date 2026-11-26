import { useEffect, useRef } from 'react'

interface HorizonWaveProps {
  syncSignal: number
  label: string
}

export default function HorizonWave({ syncSignal, label }: HorizonWaveProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const syncUntilRef = useRef(0)

  useEffect(() => {
    if (syncSignal > 0) {
      syncUntilRef.current = performance.now() + 2600
    }
  }, [syncSignal])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)')
    const isReduced = () => reduceMQ.matches

    let width = 0
    let height = 0
    let dpr = 1
    let running = true
    let raf = 0
    let delta = Math.PI * 0.9
    const startTime = performance.now()

    const makeGradient = (color: string) => {
      const g = ctx.createLinearGradient(0, 0, width, 0)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(0.18, color.replace('A', '.28'))
      g.addColorStop(0.5, color.replace('A', '.95'))
      g.addColorStop(0.82, color.replace('A', '.28'))
      g.addColorStop(1, 'rgba(0,0,0,0)')
      return g
    }

    const strokeWave = (time: number, phi: number, stroke: CanvasGradient, lineWidth: number) => {
      const mid = height * 0.5
      const amp = Math.min(height * 0.32, 42)
      const k = (Math.PI * 2) / Math.max(260, width * 0.2)
      const w = time * 0.0011
      ctx.beginPath()
      for (let x = 0; x <= width + 4; x += 4) {
        const u = x / width - 0.5
        const env = Math.exp(-(u * u) / 0.055)
        const y =
          mid +
          env *
            amp *
            (Math.sin(x * k - w + phi) * 0.78 +
              Math.sin(x * k * 2.1 - w * 1.4 + phi * 1.6) * 0.22)
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = stroke
      ctx.lineWidth = lineWidth
      ctx.stroke()
    }

    const draw = (now: number) => {
      const reduced = isReduced()
      const elapsed = reduced ? 2400 : now - startTime
      const natural = reduced ? 0.35 : (Math.cos(elapsed * 0.00026) * 0.5 + 0.5) * Math.PI * 1.05
      const target = now < syncUntilRef.current ? 0 : natural
      delta += (target - delta) * (now < syncUntilRef.current ? 0.08 : 0.03)
      if (reduced) delta = natural
      const align = Math.max(0, 1 - delta / (Math.PI * 0.22))
      wrap.classList.toggle('is-sync', align > 0.55 && !reduced)

      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'
      ctx.shadowBlur = 0
      strokeWave(elapsed, 0, makeGradient('rgba(255,107,71,A)'), 1.6)
      strokeWave(elapsed, delta, makeGradient('rgba(59,216,157,A)'), 1.6)
      if (align > 0) {
        ctx.shadowColor = 'rgba(242,194,123,.9)'
        ctx.shadowBlur = 16 * align
        strokeWave(elapsed, delta / 2, makeGradient('rgba(242,194,123,A)'), 0.9 + align * 1.2)
        ctx.shadowBlur = 0
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (isReduced() || !running) draw(performance.now())
    }

    const frame = (now: number) => {
      draw(now)
      raf = window.requestAnimationFrame(frame)
    }
    const start = () => {
      if (isReduced() || raf) return
      raf = window.requestAnimationFrame(frame)
    }
    const stop = () => {
      window.cancelAnimationFrame(raf)
      raf = 0
    }

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(canvas)
    } else {
      window.addEventListener('resize', resize)
    }
    resize()

    let intersectionObserver: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver((entries) => {
        running = entries[entries.length - 1]?.isIntersecting ?? true
        if (running) start()
        else stop()
      })
      intersectionObserver.observe(wrap)
    } else {
      start()
    }

    const onVisibility = () => {
      if (document.hidden) stop()
      else if (running) start()
    }
    const onReduceChange = () => {
      stop()
      resize()
      start()
    }

    document.addEventListener('visibilitychange', onVisibility)
    reduceMQ.addEventListener?.('change', onReduceChange)
    draw(performance.now())

    return () => {
      stop()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      intersectionObserver?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      reduceMQ.removeEventListener?.('change', onReduceChange)
    }
  }, [])

  return (
    <div ref={wrapRef} className="horizon" aria-hidden="true">
      <canvas ref={canvasRef} />
      <span className="horizon__tag">{label}</span>
    </div>
  )
}
