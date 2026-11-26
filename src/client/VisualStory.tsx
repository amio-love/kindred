import { useRef, useState } from 'react'
import type { CopyBundle } from './i18n'

interface VisualStoryProps {
  copy: CopyBundle
  copied: boolean
  onCopy: () => void
}

const SIGNAL_TOKENS = ['B', 'D', 'U', 'A', 'C'] as const
const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const

export default function VisualStory({ copy, copied, onCopy }: VisualStoryProps) {
  const [picks, setPicks] = useState<Record<string, number>>({})
  const firstOptRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const retryBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const handlePick = (cardId: string, optionIdx: number) => {
    setPicks((prev) => {
      if (prev[cardId] !== undefined) return prev
      return { ...prev, [cardId]: optionIdx }
    })
    window.requestAnimationFrame(() => {
      retryBtnRefs.current[cardId]?.focus()
    })
  }

  const handleReset = (cardId: string) => {
    setPicks((prev) => {
      const next = { ...prev }
      delete next[cardId]
      return next
    })
    window.requestAnimationFrame(() => {
      firstOptRefs.current[cardId]?.focus()
    })
  }

  return (
    <div className="story">
      <section className="story-block">
        <div className="story-head">
          <h2>{copy.galleryTitle}</h2>
          <p>{copy.galleryHint}</p>
        </div>

        <div className="subtext-grid">
          {copy.subtextCards.map((card) => {
            const picked = picks[card.id]
            const hasPicked = picked !== undefined
            const resonated = picked === card.drawerIndex

            return (
              <article key={card.id} className={`subtext-card ${resonated ? 'subtext-card--hit' : ''}`}>
                <div className="subtext-art-wrap">
                  <img
                    src={card.src}
                    alt={card.alt}
                    className="subtext-art"
                    loading="lazy"
                    width={360}
                    height={360}
                  />
                  <span className="subtext-art-badge">{card.artBadge}</span>
                </div>

                <div className="subtext-choices" role="group" aria-label={card.alt}>
                  {card.options.map((optText, idx) => {
                    const isPicked = picked === idx
                    const isDrawerPick = idx === card.drawerIndex
                    const stateClass =
                      hasPicked && isDrawerPick
                        ? 'subtext-opt--hit'
                        : isPicked && !isDrawerPick
                          ? 'subtext-opt--yours'
                          : hasPicked
                            ? 'subtext-opt--dim'
                            : ''

                    return (
                      <button
                        key={optText}
                        ref={
                          idx === 0
                            ? (el) => {
                                firstOptRefs.current[card.id] = el
                              }
                            : undefined
                        }
                        type="button"
                        disabled={hasPicked}
                        className={`subtext-opt ${stateClass}`}
                        aria-pressed={isPicked}
                        onClick={() => handlePick(card.id, idx)}
                      >
                        <span className="subtext-opt-key">{OPTION_LETTERS[idx]}</span>
                        <span className="subtext-opt-text">{optText}</span>
                        {isPicked && !isDrawerPick && (
                          <span className="subtext-opt-tag subtext-opt-tag--yours">{copy.yourLensTag}</span>
                        )}
                        {hasPicked && isDrawerPick && (
                          <span className="subtext-opt-tag subtext-opt-tag--hit">
                            {resonated ? copy.resonatedTag : copy.drawerLensTag}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                <div className="subtext-feedback" aria-live="polite">
                  {!hasPicked && <span className="subtext-idle">{copy.pickPromptLabel}</span>}
                  {hasPicked && (
                    <div className="subtext-result-row">
                      <span className={resonated ? 'subtext-hit-note' : 'subtext-different-note'}>
                        {resonated ? card.hitNote : copy.differentLensNote}
                      </span>
                      <button
                        ref={(el) => {
                          retryBtnRefs.current[card.id] = el
                        }}
                        type="button"
                        className="subtext-retry-btn"
                        onClick={() => handleReset(card.id)}
                      >
                        {copy.retryCardLabel}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="story-block">
        <div className="story-head">
          <h2>{copy.privacyTitle}</h2>
        </div>

        <div className="bridge-diagram" role="img" aria-label={copy.privacyTitle}>
          <div className="vault-node">
            <span className="vault-ring" aria-hidden="true" />
            <strong>{copy.privacyLeftTitle}</strong>
            <span>{copy.privacyLeftSub}</span>
          </div>

          <div className="bridge-track">
            <div className="bridge-wire" aria-hidden="true">
              <div className="bridge-line" />
              <div className="bridge-packets">
                {SIGNAL_TOKENS.map((tok, i) => (
                  <span key={tok} className={`signal-chip signal-chip--${i}`}>
                    {tok}
                  </span>
                ))}
              </div>
            </div>
            <span className="bridge-caption">{copy.privacyBridgeLabel}</span>
          </div>

          <div className="vault-node vault-node--peer">
            <span className="vault-ring vault-ring--peer" aria-hidden="true" />
            <strong>{copy.privacyRightTitle}</strong>
            <span>{copy.privacyRightSub}</span>
          </div>
        </div>
      </section>

      <section className="closing">
        <h2>{copy.closingTitle}</h2>
        <button
          type="button"
          className={`cta-btn cta-btn--large ${copied ? 'cta-btn--copied' : ''}`}
          onClick={onCopy}
        >
          {copied ? copy.copiedButton : copy.copyButton}
        </button>
      </section>
    </div>
  )
}
