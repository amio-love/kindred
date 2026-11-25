import { useState } from 'react'
import type { CopyBundle } from './i18n'

interface VisualStoryProps {
  copy: CopyBundle
  copied: boolean
  onCopy: () => void
}

const SIGNAL_TOKENS = ['B', 'D', 'U', 'A', 'C'] as const

export default function VisualStory({ copy, copied, onCopy }: VisualStoryProps) {
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({})

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="story">
      <section className="story-block">
        <div className="story-head">
          <h2>{copy.galleryTitle}</h2>
          <p>{copy.galleryHint}</p>
        </div>

        <div className="polaroid-grid">
          {copy.sketches.map((item, idx) => {
            const isOpen = Boolean(revealedIds[item.id])
            return (
              <button
                key={item.id}
                type="button"
                className={`polaroid polaroid--${idx + 1} ${isOpen ? 'polaroid--open' : ''}`}
                onClick={() => toggleReveal(item.id)}
              >
                <div className="polaroid-img-wrap">
                  <img
                    src={item.src}
                    alt={item.alt}
                    className="polaroid-img"
                    loading="lazy"
                    width={320}
                    height={320}
                  />
                </div>
                <div className="polaroid-foot">
                  <span className="polaroid-hint">{item.hint}</span>
                  <span className="polaroid-answer">
                    {isOpen ? item.answer : copy.revealPromptLabel}
                  </span>
                </div>
              </button>
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
