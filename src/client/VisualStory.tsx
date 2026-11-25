import { useState } from 'react'
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

  const handlePick = (cardId: string, optionIdx: number) => {
    setPicks((prev) => {
      if (prev[cardId] !== undefined) return prev
      return { ...prev, [cardId]: optionIdx }
    })
  }

  const handleReset = (cardId: string) => {
    setPicks((prev) => {
      const next = { ...prev }
      delete next[cardId]
      return next
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
            const hit = picked === card.correctIndex

            return (
              <article key={card.id} className={`subtext-card ${hit ? 'subtext-card--hit' : ''}`}>
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
                    const isCorrect = idx === card.correctIndex
                    const stateClass =
                      hasPicked && isCorrect
                        ? 'subtext-opt--hit'
                        : isPicked && !isCorrect
                          ? 'subtext-opt--surface'
                          : hasPicked
                            ? 'subtext-opt--dim'
                            : ''

                    return (
                      <button
                        key={optText}
                        type="button"
                        disabled={hasPicked}
                        className={`subtext-opt ${stateClass}`}
                        aria-pressed={isPicked}
                        onClick={() => handlePick(card.id, idx)}
                      >
                        <span className="subtext-opt-key">{OPTION_LETTERS[idx]}</span>
                        <span className="subtext-opt-text">{optText}</span>
                        {isPicked && !isCorrect && (
                          <span className="subtext-opt-tag">{copy.surfaceTag}</span>
                        )}
                        {hasPicked && isCorrect && (
                          <span className="subtext-opt-tag subtext-opt-tag--hit">
                            {copy.wavelengthTag}
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
                      <span className={hit ? 'subtext-hit-note' : 'subtext-surface-note'}>
                        {hit ? card.hitNote : copy.surfaceRetryNote}
                      </span>
                      <button
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
