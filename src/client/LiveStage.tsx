import { useEffect, useRef, useState } from 'react'
import type { CopyBundle } from './i18n'

const SCENE_DURATION_MS = 5600

function useCountUp(target: number, active: boolean, durationMs = 680): number {
  const [value, setValue] = useState(target)

  useEffect(() => {
    if (!active) return
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setValue(target)
      return
    }

    let rafId = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) {
        rafId = window.requestAnimationFrame(tick)
      }
    }
    setValue(0)
    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [target, active, durationMs])

  return value
}

interface LiveStageProps {
  copy: CopyBundle
  onSceneChange?: (sceneIndex: number) => void
}

export default function LiveStage({ copy, onSceneChange }: LiveStageProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [pickedOption, setPickedOption] = useState<number>(copy.scenes[0].defaultPickedIndex)
  const [sketchIdx, setSketchIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [inView, setInView] = useState(true)
  const stageRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    onSceneChange?.(activeIndex)
  }, [activeIndex, onSceneChange])

  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        setInView(Boolean(entries[0]?.isIntersecting))
      },
      { threshold: 0.2 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (paused || !inView) return
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % 3)
    }, SCENE_DURATION_MS)
    return () => window.clearInterval(timer)
  }, [paused, inView])

  const humanScore = useCountUp(92, activeIndex === 1)
  const aiScore = useCountUp(83, activeIndex === 1)

  const quizScene = copy.scenes[0]
  const revealScene = copy.scenes[1]
  const drawScene = copy.scenes[2]
  const currentSketch = copy.sketches[sketchIdx]!

  const handleSelectOption = (idx: number) => {
    setPickedOption(idx)
    setPaused(true)
  }

  return (
    <div
      ref={stageRef}
      className="stage"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="stage-aura" aria-hidden="true" />
      <div className="chat-shell">
        <div className="chat-bar">
          <div className="chat-bar-left">
            <span className="live-dot" aria-hidden="true" />
            <span className="chat-bar-title">{copy.stageHeader}</span>
          </div>
          <span className="chat-bar-tag">{copy.stageLiveTag}</span>
        </div>

        <div className="chat-body" key={`${activeIndex}-${copy.stageHeader}`}>
          {activeIndex === 0 && (
            <div className="scene">
              <div className="bubble bubble-user anim-pop anim-d1">{quizScene.userLine}</div>
              <div className="bubble bubble-ai anim-pop anim-d2">
                <p className="bubble-lead">{quizScene.aiIntro}</p>
                <div className="quiz-card">
                  <div className="quiz-card-head">
                    <span className="quiz-q">{quizScene.question}</span>
                    <span className="quiz-try">{copy.interactiveHint}</span>
                  </div>
                  <div className="quiz-opts">
                    {quizScene.options.map((opt, idx) => (
                      <button
                        key={opt}
                        type="button"
                        className={`quiz-opt ${idx === pickedOption ? 'quiz-opt--picked' : ''}`}
                        onClick={() => handleSelectOption(idx)}
                      >
                        <span className="quiz-opt-key">{String.fromCharCode(65 + idx)}</span>
                        <span>{opt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pill-badge pill-badge--emerald anim-pop anim-d3">
                <span className="pulse-dot" aria-hidden="true" />
                {quizScene.statusBadge}
              </div>
            </div>
          )}

          {activeIndex === 1 && (
            <div className="scene">
              <div className="bubble bubble-ai anim-pop anim-d1">
                <span className="reveal-eyebrow">{revealScene.eyebrow}</span>
                <div className="score-grid">
                  <div className="score-tile score-tile--human">
                    <span className="score-num">{humanScore}%</span>
                    <span className="score-label">{revealScene.humanLabel}</span>
                  </div>
                  <div className="score-tile score-tile--ai">
                    <span className="score-num">{aiScore}%</span>
                    <span className="score-label">{revealScene.aiLabel}</span>
                  </div>
                </div>
                <div className="callout-bar anim-pop anim-d2">{revealScene.callout}</div>
              </div>
              <div className="bubble bubble-user anim-pop anim-d3">{revealScene.anchorBubble}</div>
            </div>
          )}

          {activeIndex === 2 && (
            <div className="scene">
              <div className="bubble bubble-ai anim-pop anim-d1">
                <div className="draw-head">
                  <span className="bubble-lead">{drawScene.aiPrompt}</span>
                  <button
                    type="button"
                    className="mini-switch"
                    onClick={() => setSketchIdx((prev) => (prev + 1) % copy.sketches.length)}
                  >
                    {copy.nextSketch}
                  </button>
                </div>
                <div className="sketch-stage">
                  <div className="sketch-art-wrap" key={currentSketch.id}>
                    <img
                      src={currentSketch.src}
                      alt={currentSketch.alt}
                      className="sketch-art"
                      width={260}
                      height={260}
                    />
                  </div>
                  <div className="sketch-meta">
                    <span className="hint-chip">{currentSketch.hint}</span>
                  </div>
                </div>
              </div>
              <div className="draw-reply">
                <div className="bubble bubble-user anim-pop anim-d2">
                  {currentSketch.answer}
                  {copy.exclaim}
                </div>
                <div className="pill-badge pill-badge--emerald anim-pop anim-d3">
                  {drawScene.winBadge}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="scene-tabs" role="tablist" aria-label="Walkthrough">
          {copy.scenes.map((scene, idx) => {
            const isActive = idx === activeIndex
            return (
              <button
                key={scene.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`scene-tab ${isActive ? 'scene-tab--active' : ''}`}
                onClick={() => setActiveIndex(idx)}
              >
                <span className="scene-tab-text">{scene.tab}</span>
                <span className="scene-track" aria-hidden="true">
                  <span
                    key={`${activeIndex}-${paused}-${inView}`}
                    className={`scene-fill ${isActive && !paused && inView ? 'scene-fill--running' : isActive ? 'scene-fill--static' : ''}`}
                  />
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
