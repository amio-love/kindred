import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { CopyBundle, Locale } from './i18n'

interface HeroVideoProps {
  locale: Locale
  copy: CopyBundle
  onResonanceBoost?: (boost: number) => void
}

const CHAPTER_STARTS = [0, 8.15, 10.0] as const
const TOTAL_DURATION = 15

export default function HeroVideo({ locale, copy, onResonanceBoost }: HeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const chapterRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [playing, setPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [activeChapter, setActiveChapter] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    video.currentTime = 0
    if (reduced) {
      video.pause()
      setPlaying(false)
      return
    }

    const playPromise = video.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        setPlaying(false)
      })
    }
  }, [locale])

  useEffect(() => {
    let rafId = 0
    let lastChapter = -1

    const sync = () => {
      const video = videoRef.current
      if (video) {
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : TOTAL_DURATION
        const cur = video.currentTime
        setProgress(Math.min(1, Math.max(0, cur / dur)))

        const chapter = cur >= CHAPTER_STARTS[2] ? 2 : cur >= CHAPTER_STARTS[1] ? 1 : 0
        if (chapter !== lastChapter) {
          lastChapter = chapter
          setActiveChapter(chapter)
          onResonanceBoost?.(chapter === 1 ? 0.92 : chapter === 2 ? 0.6 : 0.25)
        }
      }
      rafId = window.requestAnimationFrame(sync)
    }

    rafId = window.requestAnimationFrame(sync)
    return () => window.cancelAnimationFrame(rafId)
  }, [onResonanceBoost])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {})
      setPlaying(true)
    } else {
      video.pause()
      setPlaying(false)
    }
  }

  const seekToChapter = (idx: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = CHAPTER_STARTS[idx] ?? 0
    if (video.paused) {
      video.play().catch(() => {})
      setPlaying(true)
    }
  }

  const handleChapterKeyDown = (event: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const count = copy.videoChapters.length
    let nextIdx: number | null = null
    if (event.key === 'ArrowRight') nextIdx = (idx + 1) % count
    else if (event.key === 'ArrowLeft') nextIdx = (idx - 1 + count) % count
    else if (event.key === 'Home') nextIdx = 0
    else if (event.key === 'End') nextIdx = count - 1
    if (nextIdx === null) return
    event.preventDefault()
    seekToChapter(nextIdx)
    chapterRefs.current[nextIdx]?.focus()
  }

  const handleProgressClick = (event: MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current
    if (!video) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : TOTAL_DURATION
    video.currentTime = ratio * dur
  }

  const handleScrubberKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const video = videoRef.current
    if (!video) return
    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : TOTAL_DURATION
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      video.currentTime = Math.min(dur, video.currentTime + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      video.currentTime = Math.max(0, video.currentTime - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      video.currentTime = 0
    } else if (event.key === 'End') {
      event.preventDefault()
      video.currentTime = Math.max(0, dur - 0.1)
    }
  }

  const handleFullscreen = () => {
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null
    if (!video) return
    if (typeof video.requestFullscreen === 'function') {
      video.requestFullscreen().catch(() => {})
    } else if (typeof video.webkitEnterFullscreen === 'function') {
      video.webkitEnterFullscreen()
    }
  }

  const currentSeconds = Math.round(progress * TOTAL_DURATION)

  return (
    <div className="stage">
      <div className="stage-aura" aria-hidden="true" />
      <div className="cinema-shell">
        <div className="cinema-viewport" onClick={togglePlay}>
          <video
            key={copy.videoSrc}
            ref={videoRef}
            className="cinema-video"
            src={copy.videoSrc}
            poster={copy.videoPoster}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
          {!playing && (
            <div className="cinema-paused-overlay" aria-hidden="true">
              <span className="cinema-play-circle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.5v13l11-6.5-11-6.5z" />
                </svg>
              </span>
            </div>
          )}
        </div>

        <div className="cinema-dock">
          <div
            className="cinema-scrubber"
            role="slider"
            tabIndex={0}
            aria-label={copy.videoProgressLabel}
            aria-valuemin={0}
            aria-valuemax={TOTAL_DURATION}
            aria-valuenow={currentSeconds}
            aria-valuetext={`${currentSeconds}s / ${TOTAL_DURATION}s`}
            onClick={handleProgressClick}
            onKeyDown={handleScrubberKeyDown}
          >
            <div className="cinema-scrubber-fill" style={{ transform: `scaleX(${progress})` }} />
          </div>

          <div className="cinema-bar">
            <div className="cinema-chapters" role="tablist" aria-label={copy.stageHeader}>
              {copy.videoChapters.map((label, idx) => {
                const isActive = idx === activeChapter
                return (
                  <button
                    key={label}
                    ref={(el) => {
                      chapterRefs.current[idx] = el
                    }}
                    type="button"
                    role="tab"
                    tabIndex={isActive ? 0 : -1}
                    aria-selected={isActive}
                    className={`cinema-chapter ${isActive ? 'cinema-chapter--active' : ''}`}
                    onClick={() => seekToChapter(idx)}
                    onKeyDown={(event) => handleChapterKeyDown(event, idx)}
                  >
                    <span className="cinema-chapter-dot" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>

            <div className="cinema-actions">
              <button
                type="button"
                className="cinema-icon-btn"
                aria-label={playing ? copy.pauseLabel : copy.playLabel}
                title={playing ? copy.pauseLabel : copy.playLabel}
                onClick={togglePlay}
              >
                {playing ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="5" width="4.5" height="14" rx="1.2" />
                    <rect x="13.5" y="5" width="4.5" height="14" rx="1.2" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5.5v13l11-6.5-11-6.5z" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className="cinema-icon-btn"
                aria-label={copy.fullscreenLabel}
                title={copy.fullscreenLabel}
                onClick={handleFullscreen}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                  <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                  <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                  <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
