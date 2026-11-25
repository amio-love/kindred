import { useEffect, useRef } from 'react'

interface ResonanceCanvasProps {
  resonanceBoost: number
}

export default function ResonanceCanvas({ resonanceBoost }: ResonanceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const boostRef = useRef(resonanceBoost)
  boostRef.current = resonanceBoost

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let rafId = 0
    let running = true
    let phase = 0
    let targetMouseX = 0.5
    let targetMouseY = 0.45
    let mouseX = 0.5
    let mouseY = 0.45

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (width > 0 && height > 0) {
        targetMouseX = Math.min(1, Math.max(0, e.clientX / width))
        targetMouseY = Math.min(1, Math.max(0, e.clientY / height))
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        running = Boolean(entries[0]?.isIntersecting)
        if (running && !reducedMotion && !rafId) {
          rafId = window.requestAnimationFrame(draw)
        }
      },
      { threshold: 0.05 },
    )
    observer.observe(canvas)

    const drawWave = (
      baseY: number,
      amp: number,
      freq: number,
      speed: number,
      color: string,
      lineWidth: number,
      phaseOffset: number,
    ) => {
      ctx.beginPath()
      const step = 12
      for (let x = 0; x <= width + step; x += step) {
        const nx = x / Math.max(1, width)
        const env = Math.sin(nx * Math.PI)
        const pull = Math.exp(-Math.pow((nx - mouseX) * 2.8, 2)) * (mouseY - 0.5) * 44
        const y =
          baseY +
          Math.sin(nx * freq * Math.PI * 2 + phase * speed + phaseOffset) * amp * env +
          Math.cos(nx * (freq * 1.7) * Math.PI * 2 - phase * speed * 0.6) * (amp * 0.28) * env +
          pull
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.stroke()
    }

    const draw = () => {
      rafId = 0
      if (!running && !reducedMotion) return

      mouseX += (targetMouseX - mouseX) * 0.04
      mouseY += (targetMouseY - mouseY) * 0.04
      phase += 0.0085 + boostRef.current * 0.004

      ctx.clearRect(0, 0, width, height)

      const centerY = height * 0.48
      const spread = (1 - boostRef.current * 0.45) * 34

      drawWave(centerY - spread, 38, 1.35, 1.0, 'rgba(247, 244, 238, 0.14)', 1.5, 0)
      drawWave(centerY - spread * 0.5, 28, 1.65, 0.78, 'rgba(247, 244, 238, 0.06)', 1, 1.2)
      drawWave(centerY + spread, 38, 1.38, -0.92, 'rgba(255, 92, 53, 0.28)', 1.75, 0.9)
      drawWave(centerY + spread * 0.35, 24, 1.85, 0.85, 'rgba(34, 197, 139, 0.18)', 1.2, 2.4)

      for (let i = 1; i <= 5; i++) {
        const nx = i / 6
        const x = nx * width
        const env = Math.sin(nx * Math.PI)
        const yA = centerY - spread + Math.sin(nx * 1.35 * Math.PI * 2 + phase) * 38 * env
        const yB = centerY + spread + Math.sin(nx * 1.38 * Math.PI * 2 - phase * 0.92 + 0.9) * 38 * env
        const dist = Math.abs(yA - yB)
        if (dist < 42) {
          const alpha = (1 - dist / 42) * 0.55
          const midY = (yA + yB) / 2
          const grad = ctx.createRadialGradient(x, midY, 0, x, midY, 26)
          grad.addColorStop(0, `rgba(255, 130, 92, ${alpha})`)
          grad.addColorStop(1, 'rgba(255, 130, 92, 0)')
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(x, midY, 26, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      if (!reducedMotion && running) {
        rafId = window.requestAnimationFrame(draw)
      }
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })

    if (reducedMotion) {
      phase = 1.4
      draw()
    } else {
      rafId = window.requestAnimationFrame(draw)
    }

    return () => {
      running = false
      if (rafId) window.cancelAnimationFrame(rafId)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [])

  return <canvas ref={canvasRef} className="resonance-canvas" aria-hidden="true" />
}
