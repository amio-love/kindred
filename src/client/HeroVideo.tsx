import { useCallback, useEffect, useRef, useState } from 'react'
import type { CopyBundle, Locale } from './i18n'

interface HeroVideoProps {
  locale: Locale
  copy: CopyBundle
}

const CHAPTER_MARKS = [0, 7.45, 9.6] as const

interface WebKitFullscreenVideo extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void
}

export default function HeroVideo({ locale, copy }: HeroVideoProps) {
  const stageRef = useRef<HTMLElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fillRefs = useRef<Array<HTMLSpanElement | null>>([null, null, null])
  const userPausedRef = useRef(false)
  const inViewRef = useRef(true)

  const [isPaused, setIsPaused] = useState(true)
  const [activeChapter, setActiveChapter] = useState(0)

  const paint = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 15
    const time = v.currentTime || 0
    let current = 0
    for (let i = 0; i < CHAPTER_MARKS.length; i += 1) {
      const mark = CHAPTER_MARKS[i] ?? 0
      if (time >= mark - 0.01) current = i
    }
    setActiveChapter((prev) => (prev === current ? prev : current))
    for (let i = 0; i < CHAPTER_MARKS.length; i += 1) {
      const a = CHAPTER_MARKS[i] ?? 0
      const b = CHAPTER_MARKS[i + 1] ?? dur
      const progress = Math.max(0, Math.min(1, (time - a) / Math.max(0.01, b - a)))
      const fill = fillRefs.current[i]
      if (fill) fill.style.setProperty('--p', progress.toFixed(4))
    }
  }, [])

  const tryPlay = useCallback(() => {
    const v = videoRef.current
    if (!v || userPausedRef.current || !inViewRef.current) return
    const promise = v.play()
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => setIsPaused(true))
    }
  }, [])

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    userPausedRef.current = prefersReduced

    const v = videoRef.current
    if (!v) return

    let raf = 0
    const loop = () => {
      paint()
      raf = window.requestAnimationFrame(loop)
    }

    const onPlay = () => {
      setIsPaused(false)
      window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(loop)
    }
    const onPause = () => {
      setIsPaused(true)
      window.cancelAnimationFrame(raf)
      paint()
    }
    const onSeeked = () => paint()
    const onEnded = () => {
      try {
        v.currentTime = 0
      } catch {
      }
      tryPlay()
    }

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('seeked', onSeeked)
    v.addEventListener('ended', onEnded)

    let observer: IntersectionObserver | null = null
    if (stageRef.current && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          inViewRef.current = entries[entries.length - 1]?.isIntersecting ?? true
          if (!inViewRef.current && !v.paused) {
            v.pause()
          } else if (inViewRef.current && v.paused && !userPausedRef.current) {
            tryPlay()
          }
        },
        { threshold: 0.25 },
      )
      observer.observe(stageRef.current)
    }

    return () => {
      window.cancelAnimationFrame(raf)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('seeked', onSeeked)
      v.removeEventListener('ended', onEnded)
      observer?.disconnect()
    }
  }, [paint, tryPlay])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const resumeAt = v.currentTime || 0
    v.poster = copy.videoPoster
    v.src = copy.videoSrc
    const onLoaded = () => {
      try {
        const cap = Math.max(0, (v.duration || 15) - 0.2)
        v.currentTime = Math.min(resumeAt, cap)
      } catch {
      }
      tryPlay()
      paint()
    }
    v.addEventListener('loadedmetadata', onLoaded, { once: true })
    v.load()
    paint()
    return () => {
      v.removeEventListener('loadedmetadata', onLoaded)
    }
  }, [locale, copy.videoSrc, copy.videoPoster, paint, tryPlay])

  const handleTogglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      userPausedRef.current = false
      inViewRef.current = true
      v.play().catch(() => {})
    } else {
      userPausedRef.current = true
      v.pause()
    }
  }, [])

  const handleChapter = useCallback(
    (index: number) => {
      const v = videoRef.current
      if (!v) return
      try {
        const mark = CHAPTER_MARKS[index] ?? 0
        v.currentTime = mark + (index === 0 ? 0 : 0.01)
      } catch {
      }
      userPausedRef.current = false
      v.play().catch(() => {})
      paint()
    },
    [paint],
  )

  const handleFullscreen = useCallback(() => {
    const frame = frameRef.current
    const v = videoRef.current as WebKitFullscreenVideo | null
    if (!frame || !v) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
      return
    }
    if (frame.requestFullscreen) {
      frame.requestFullscreen().catch(() => {
        v.webkitEnterFullscreen?.()
      })
    } else {
      v.webkitEnterFullscreen?.()
    }
  }, [])

  return (
    <figure ref={stageRef} className={`stage${isPaused ? ' is-paused' : ''}`}>
      <div className="stage__glow" aria-hidden="true" />
      <div ref={frameRef} className="stage__frame">
        <video
          ref={videoRef}
          muted
          playsInline
          preload="metadata"
          disablePictureInPicture
          onClick={handleTogglePlay}
        />
        <div className="stage__label">
          <button
            type="button"
            className="ctl"
            aria-label={isPaused ? copy.playLabel : copy.pauseLabel}
            onClick={handleTogglePlay}
          >
            <svg className="i-play" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.4-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z"
                fill="currentColor"
              />
            </svg>
            <svg className="i-pause" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
              <rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
            </svg>
          </button>
          <span className="stage__tag">
            <i />
            <span>{copy.stageTag}</span>
          </span>
        </div>
        <button
          type="button"
          className="ctl stage__fs"
          aria-label={copy.fullscreenLabel}
          onClick={handleFullscreen}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2.5 6V3.5a1 1 0 0 1 1-1H6M10 2.5h2.5a1 1 0 0 1 1 1V6M13.5 10v2.5a1 1 0 0 1-1 1H10M6 13.5H3.5a1 1 0 0 1-1-1V10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <figcaption className="sr">{copy.stageCaption}</figcaption>
      <div className="chapters" role="group" aria-label={copy.chaptersAria}>
        {copy.chapters.map((chapter, idx) => (
          <button
            key={chapter.num}
            type="button"
            className={`chap${activeChapter === idx ? ' is-on' : ''}`}
            onClick={() => handleChapter(idx)}
          >
            <span className="chap__bar">
              <span
                ref={(el) => {
                  fillRefs.current[idx] = el
                }}
                className="chap__fill"
              />
            </span>
            <span className="chap__row">
              <span className="chap__num">{chapter.num}</span>
              <span className="chap__label">{chapter.label}</span>
            </span>
            <span className="chap__sub">{chapter.sub}</span>
          </button>
        ))}
      </div>
    </figure>
  )
}
