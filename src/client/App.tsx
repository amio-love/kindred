import { useCallback, useEffect, useState } from 'react'
import HeroVideo from './HeroVideo'
import HostShowcase from './HostShowcase'
import { COPY, detectInitialLocale, type Locale } from './i18n'
import ResonanceCanvas from './ResonanceCanvas'
import VisualStory from './VisualStory'
import { registerKindredWebMcp } from './webmcp'

function fallbackCopy(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(area)
  return ok
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(detectInitialLocale)
  const [copied, setCopied] = useState(false)
  const [resonanceBoost, setResonanceBoost] = useState(0.25)

  useEffect(() => {
    const reg = registerKindredWebMcp()
    return reg.cleanup
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.title = COPY[locale].pageTitle
    try {
      window.localStorage.setItem('kindred_lang', locale)
    } catch {
    }
  }, [locale])

  const copy = COPY[locale]
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const promptText = copy.promptTemplate(`${origin}/skill.md`)

  const handleCopy = useCallback(async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(promptText)
      ok = true
    } catch {
      ok = fallbackCopy(promptText)
    }
    if (ok) {
      setCopied(true)
      setResonanceBoost(1)
      window.setTimeout(() => {
        setCopied(false)
        setResonanceBoost(0.25)
      }, 2400)
    }
  }, [promptText])

  return (
    <div className="app">
      <div className="hero-backdrop">
        <ResonanceCanvas resonanceBoost={resonanceBoost} />
        <div className="container">
          <header className="topbar">
            <a href="/" className="brand" aria-label="Kindred">
              <span className="brand-mark" aria-hidden="true">
                <span className="brand-dot brand-dot--a" />
                <span className="brand-dot brand-dot--b" />
              </span>
              <span className="brand-name">Kindred</span>
            </a>

            <div className="topbar-right">
              <nav className="topbar-links" aria-label="Links">
                <a href="/skill.md" className="top-link">
                  {copy.protocolLink}
                </a>
                <a
                  href="https://github.com/amio-love/kindred"
                  target="_blank"
                  rel="noreferrer"
                  className="top-link"
                >
                  GitHub
                </a>
              </nav>

              <div className="lang-switch" role="group" aria-label="Language">
                <button
                  type="button"
                  className={`lang-btn ${locale === 'zh' ? 'lang-btn--active' : ''}`}
                  aria-pressed={locale === 'zh'}
                  onClick={() => setLocale('zh')}
                >
                  中
                </button>
                <button
                  type="button"
                  className={`lang-btn ${locale === 'en' ? 'lang-btn--active' : ''}`}
                  aria-pressed={locale === 'en'}
                  onClick={() => setLocale('en')}
                >
                  EN
                </button>
              </div>
            </div>
          </header>

          <main className="hero-grid">
            <section className="hero-copy">
              <span className="eyebrow">{copy.eyebrow}</span>
              <h1 className={locale === 'en' ? 'h1-en' : 'h1-zh'}>{copy.headline}</h1>
              <p className="hero-sub">{copy.subtitle}</p>

              <div className="command-bar">
                <code className="command-code">{promptText}</code>
                <button
                  type="button"
                  className={`cta-btn ${copied ? 'cta-btn--copied' : ''}`}
                  onClick={handleCopy}
                >
                  {copied ? copy.copiedButton : copy.copyButton}
                </button>
              </div>

              <HostShowcase
                locale={locale}
                label={copy.worksWith}
                moreBadge={copy.moreHostsBadge}
                openProtocolNote={copy.openProtocolNote}
              />

              <ul className="trust-row">
                {copy.trustItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="hero-stage" aria-label={copy.stageHeader}>
              <HeroVideo locale={locale} copy={copy} onResonanceBoost={setResonanceBoost} />
            </section>
          </main>
        </div>
      </div>

      <div className="container">
        <VisualStory copy={copy} copied={copied} onCopy={handleCopy} />

        <footer className="site-footer">
          <span className="footer-brand">Kindred</span>
          <div className="footer-links">
            <a href="/skill.md">{copy.protocolLink}</a>
            <a href="https://github.com/amio-love/kindred" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}
