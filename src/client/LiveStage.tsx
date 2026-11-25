import { useEffect, useRef, useState } from 'react'
import type { CopyBundle } from './i18n'

const SCENE_DURATION_MS = 5200

function SunglassesCatArtwork() {
  return (
    <svg
      viewBox="0 0 400 320"
      className="cat-svg"
      role="img"
      aria-label="Cat wearing sunglasses illustration"
    >
      <rect width="400" height="320" rx="18" fill="#FAF8F3" />
      <g strokeLinecap="round" strokeLinejoin="round" fill="none">
        <polyline
          className="cat-stroke cat-stroke--1"
          stroke="#181A1F"
          strokeWidth="6"
          points="108,158 118,68 164,114 236,114 282,68 292,158 282,226 244,264 156,264 118,226 108,158"
        />
        <polyline
          className="cat-stroke cat-stroke--2"
          stroke="#FF5A36"
          strokeWidth="5"
          points="126,120 130,88 152,112"
        />
        <polyline
          className="cat-stroke cat-stroke--2"
          stroke="#FF5A36"
          strokeWidth="5"
          points="274,120 270,88 248,112"
        />
        <polygon
          className="cat-fill"
          fill="#181A1F"
          stroke="#181A1F"
          strokeWidth="5"
          points="128,154 190,154 186,192 134,192"
        />
        <polygon
          className="cat-fill"
          fill="#181A1F"
          stroke="#181A1F"
          strokeWidth="5"
          points="210,154 272,154 266,192 214,192"
        />
        <line className="cat-stroke cat-stroke--3" stroke="#181A1F" strokeWidth="6" x1="190" y1="168" x2="210" y2="168" />
        <line className="cat-stroke cat-stroke--3" stroke="#181A1F" strokeWidth="5" x1="108" y1="162" x2="128" y2="166" />
        <line className="cat-stroke cat-stroke--3" stroke="#181A1F" strokeWidth="5" x1="292" y1="162" x2="272" y2="166" />
        <line className="cat-stroke cat-stroke--4" stroke="#60A5FA" strokeWidth="4" x1="146" y1="162" x2="162" y2="184" />
        <line className="cat-stroke cat-stroke--4" stroke="#60A5FA" strokeWidth="4" x1="228" y1="162" x2="244" y2="184" />
        <polygon
          className="cat-stroke cat-stroke--5"
          fill="#FF5A36"
          stroke="#FF5A36"
          strokeWidth="3"
          points="192,208 208,208 200,218"
        />
        <polyline
          className="cat-stroke cat-stroke--5"
          stroke="#181A1F"
          strokeWidth="5"
          points="174,230 190,238 200,226 210,238 226,230"
        />
        <line className="cat-stroke cat-stroke--6" stroke="#181A1F" strokeWidth="4" x1="72" y1="204" x2="112" y2="212" />
        <line className="cat-stroke cat-stroke--6" stroke="#181A1F" strokeWidth="4" x1="74" y1="228" x2="114" y2="224" />
        <line className="cat-stroke cat-stroke--6" stroke="#181A1F" strokeWidth="4" x1="328" y1="204" x2="288" y2="212" />
        <line className="cat-stroke cat-stroke--6" stroke="#181A1F" strokeWidth="4" x1="326" y1="228" x2="286" y2="224" />
      </g>
    </svg>
  )
}

interface LiveStageProps {
  copy: CopyBundle
}

export default function LiveStage({ copy }: LiveStageProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [inView, setInView] = useState(true)
  const stageRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        setInView(Boolean(entries[0]?.isIntersecting))
      },
      { threshold: 0.25 },
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

  const quizScene = copy.scenes[0]
  const revealScene = copy.scenes[1]
  const drawScene = copy.scenes[2]

  return (
    <div
      ref={stageRef}
      className="stage"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="stage-glow" aria-hidden="true" />
      <div className="chat-window">
        <div className="chat-bar">
          <div className="chat-bar-left">
            <span className="status-dot" aria-hidden="true" />
            <span className="chat-bar-title">{copy.stageHeader}</span>
          </div>
          <span className="chat-bar-tag">{copy.stageLiveTag}</span>
        </div>

        <div className="chat-canvas" key={`${activeIndex}-${copy.stageHeader}`}>
          {activeIndex === 0 && (
            <div className="scene scene-quiz">
              <div className="bubble bubble-user anim-pop anim-d1">{quizScene.userLine}</div>
              <div className="bubble bubble-ai anim-pop anim-d2">
                <p className="bubble-text">{quizScene.aiIntro}</p>
                <div className="quiz-card">
                  <div className="quiz-q">{quizScene.question}</div>
                  <div className="quiz-opts">
                    {quizScene.options.map((opt, idx) => (
                      <div
                        key={opt}
                        className={`quiz-opt ${idx === quizScene.pickedIndex ? 'quiz-opt--picked' : ''}`}
                      >
                        <span className="quiz-opt-key">{String.fromCharCode(65 + idx)}</span>
                        <span>{opt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="stage-pill stage-pill--emerald anim-pop anim-d3">
                <span className="pulse-dot" aria-hidden="true" />
                {quizScene.statusBadge}
              </div>
            </div>
          )}

          {activeIndex === 1 && (
            <div className="scene scene-reveal">
              <div className="bubble bubble-ai anim-pop anim-d1">
                <span className="reveal-eyebrow">{revealScene.eyebrow}</span>
                <div className="score-row">
                  <div className="score-box score-box--human">
                    <span className="score-num">92%</span>
                    <span className="score-label">{revealScene.humanLabel}</span>
                  </div>
                  <div className="score-box score-box--ai">
                    <span className="score-num">83%</span>
                    <span className="score-label">{revealScene.aiLabel}</span>
                  </div>
                </div>
                <div className="callout-strip anim-pop anim-d2">{revealScene.callout}</div>
              </div>
              <div className="bubble bubble-user anim-pop anim-d3">{revealScene.anchorBubble}</div>
            </div>
          )}

          {activeIndex === 2 && (
            <div className="scene scene-draw">
              <div className="bubble bubble-ai anim-pop anim-d1">
                <div className="draw-head">
                  <span className="bubble-text">{drawScene.aiPrompt}</span>
                  <span className="hint-chip">{drawScene.hintChip}</span>
                </div>
                <div className="draw-frame">
                  <SunglassesCatArtwork />
                </div>
              </div>
              <div className="draw-reply-row">
                <div className="bubble bubble-user anim-pop anim-d2">{drawScene.guessBubble}</div>
                <div className="stage-pill stage-pill--emerald anim-pop anim-d3">{drawScene.winBadge}</div>
              </div>
            </div>
          )}
        </div>

        <div className="scene-tabs" role="tablist" aria-label="Product walkthrough">
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
                <span className="scene-tab-label">{scene.tab}</span>
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
