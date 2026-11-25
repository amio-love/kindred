import { useEffect, useState } from 'react'
import { COPY, detectInitialLocale, type Locale } from './i18n'
import LiveStage from './LiveStage'
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

  useEffect(() => {
    const reg = registerKindredWebMcp()
    return reg.cleanup
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.title = COPY[locale].pageTitle
    window.localStorage.setItem('kindred_lang', locale)
  }, [locale])

  const copy = COPY[locale]
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const promptText = copy.promptTemplate(`${origin}/skill.md`)

  const handleCopy = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(promptText)
      ok = true
    } catch {
      ok = fallbackCopy(promptText)
    }
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2400)
    }
  }

  return (
    <div className="page">
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
          <h1>{copy.headline}</h1>
          <p className="hero-sub">{copy.subtitle}</p>

          <div className="prompt-dock">
            <code className="prompt-text">{promptText}</code>
            <button
              type="button"
              className={`cta-btn ${copied ? 'cta-btn--copied' : ''}`}
              onClick={handleCopy}
            >
              {copied ? copy.copiedButton : copy.copyButton}
            </button>
          </div>

          <ul className="trust-row">
            {copy.trustItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <div className="hosts-row">
            <span className="hosts-label">{copy.worksWith}</span>
            <span className="hosts-list">Meta Muse · ChatGPT · Claude · Grok · OpenClaw</span>
          </div>
        </section>

        <section className="hero-stage" aria-label={copy.stageHeader}>
          <LiveStage copy={copy} />
        </section>
      </main>
    </div>
  )
}
