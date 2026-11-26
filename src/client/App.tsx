import { useCallback, useEffect, useRef, useState } from 'react'
import HeroVideo from './HeroVideo'
import HorizonWave from './HorizonWave'
import HostShowcase from './HostShowcase'
import { COPY, detectInitialLocale, type Locale } from './i18n'
import { registerKindredWebMcp } from './webmcp'

function fallbackCopy(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}

function selectNode(node: HTMLElement | null) {
  if (!node) return
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(node)
  selection.removeAllRanges()
  selection.addRange(range)
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(detectInitialLocale)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'fallback'>('idle')
  const [stamped, setStamped] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [syncSignal, setSyncSignal] = useState(0)

  const promptRef = useRef<HTMLParagraphElement | null>(null)
  const copyTimerRef = useRef<number>(0)
  const stampTimerRef = useRef<number>(0)

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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    return () => {
      window.clearTimeout(copyTimerRef.current)
      window.clearTimeout(stampTimerRef.current)
    }
  }, [])

  const copy = COPY[locale]
  const origin =
    typeof window !== 'undefined' && window.location.origin !== 'null'
      ? window.location.origin
      : 'https://kindred.byheaven0912.workers.dev'
  const hostPath = origin.replace(/^https?:\/\//, '')
  const protocolPrefix = origin.startsWith('http://') ? 'http://' : 'https://'
  const skillUrl = `${origin}/skill.md`
  const promptText = `${copy.promptBefore}${skillUrl}${copy.promptAfter}`

  const handleCopy = useCallback(async () => {
    let ok = false
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(promptText)
        ok = true
      }
    } catch {
      ok = false
    }
    if (!ok) ok = fallbackCopy(promptText)
    if (!ok) selectNode(promptRef.current)

    setCopyState(ok ? 'copied' : 'fallback')
    if (ok) setSyncSignal((n) => n + 1)

    setStamped(false)
    window.clearTimeout(stampTimerRef.current)
    window.requestAnimationFrame(() => {
      setStamped(true)
      stampTimerRef.current = window.setTimeout(() => setStamped(false), 720)
    })

    window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => setCopyState('idle'), 2800)
  }, [promptText])

  const handleSlipClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-copy-btn]')) return
      const selection = window.getSelection()
      if (selection && String(selection).length > 0) return
      void handleCopy()
    },
    [handleCopy],
  )

  const copyLabel =
    copyState === 'copied'
      ? copy.copiedButton
      : copyState === 'fallback'
        ? copy.copyFallback
        : copy.copyButton

  return (
    <div className="page">
      <header className={`nav${scrolled ? ' is-scrolled' : ''}`}>
        <div className="wrap nav__in">
          <a className="brand" href="#top" aria-label="Kindred">
            <span className="brand__mark" aria-hidden="true">
              <i />
              <i />
            </span>
            <span className="brand__name">Kindred</span>
          </a>

          <nav className="nav__links" aria-label="Kindred">
            <a className="nav__a" href="/skill.md">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M4 1.8h5.2L12.5 5v8.2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1z M9 1.8V5.3h3.4M5.5 8.5h5M5.5 11h3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
              <span className="t">{copy.protocolLink}</span>
            </a>

            <a
              className="nav__a"
              href="https://github.com/amio-love/kindred"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 .2"
                />
              </svg>
              <span className="t">GitHub</span>
            </a>

            <div className="lang" data-lang={locale} role="group" aria-label="Language">
              <span className="lang__pill" aria-hidden="true" />
              <button
                type="button"
                aria-pressed={locale === 'zh'}
                lang="zh-CN"
                onClick={() => setLocale('zh')}
              >
                中
              </button>
              <button
                type="button"
                aria-pressed={locale === 'en'}
                lang="en"
                onClick={() => setLocale('en')}
              >
                EN
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main id="top" className="main">
        <section className="hero" aria-labelledby="h-hero">
          <div className="wrap">
            <div className="hero__grid">
              <div className="hero__copy">
                <div className="eyebrow">
                  <span className="eyebrow__dot" aria-hidden="true" />
                  <span>{copy.eyebrow}</span>
                </div>

                <h1 className="h1" id="h-hero">
                  {locale === 'zh' ? (
                    <>
                      让懂你的 <span className="latin">AI</span>，
                      <br />
                      {copy.headlinePrefix}
                      <span className="accent">
                        {copy.headlineAccent}
                        <svg
                          className="accent__wave"
                          viewBox="0 0 100 10"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <g className="wa">
                            <g className="slide">
                              <path d="M0 5 Q12.5 0 25 5 T50 5 T75 5 T100 5 T125 5 T150 5 T175 5 T200 5" />
                            </g>
                          </g>
                          <g className="wb">
                            <g className="phase">
                              <g className="slide">
                                <path d="M-50 5 Q-37.5 0 -25 5 T0 5 T25 5 T50 5 T75 5 T100 5 T125 5 T150 5 T175 5 T200 5" />
                              </g>
                            </g>
                          </g>
                        </svg>
                      </span>
                      {copy.headlineSuffix}
                    </>
                  ) : (
                    <>
                      {'Let your AI find '}
                      <br />
                      {copy.headlinePrefix}
                      <span className="accent">
                        {copy.headlineAccent}
                        <svg
                          className="accent__wave"
                          viewBox="0 0 100 10"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <g className="wa">
                            <g className="slide">
                              <path d="M0 5 Q12.5 0 25 5 T50 5 T75 5 T100 5 T125 5 T150 5 T175 5 T200 5" />
                            </g>
                          </g>
                          <g className="wb">
                            <g className="phase">
                              <g className="slide">
                                <path d="M-50 5 Q-37.5 0 -25 5 T0 5 T25 5 T50 5 T75 5 T100 5 T125 5 T150 5 T175 5 T200 5" />
                              </g>
                            </g>
                          </g>
                        </svg>
                      </span>
                    </>
                  )}
                </h1>

                <p className="lede">{copy.subtitle}</p>

                <div
                  className={`slip${stamped ? ' is-stamped' : ''}`}
                  onClick={handleSlipClick}
                >
                  <div className="slip__head">
                    <span className="slip__route">
                      <i />
                      <span>{copy.slipFrom}</span>
                      <svg viewBox="0 0 14 10" aria-hidden="true">
                        <path
                          d="M1 5h11M8.5 1.5L12 5 8.5 8.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>{copy.slipTo}</span>
                    </span>
                  </div>

                  <p ref={promptRef} className="slip__text">
                    {copy.promptBefore}
                    <span className="slip__url">
                      {protocolPrefix}
                      <wbr />
                      {hostPath}/<wbr />
                      skill.md
                    </span>
                    {copy.promptAfter}
                  </p>

                  <div className="slip__foot">
                    <span className="slip__note">{copy.slipNote}</span>
                    <button
                      type="button"
                      data-copy-btn
                      className={`copy${copyState === 'copied' ? ' is-copied' : ''}`}
                      onClick={() => void handleCopy()}
                    >
                      <span className="copy__ico" aria-hidden="true">
                        <svg className="cp" viewBox="0 0 20 20">
                          <rect
                            x="6.5"
                            y="6.5"
                            width="10"
                            height="10"
                            rx="2.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                          />
                          <path
                            d="M13.5 4.2V4a1.5 1.5 0 0 0-1.5-1.5H5A2.5 2.5 0 0 0 2.5 5v7A1.5 1.5 0 0 0 4 13.5h.3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                          />
                        </svg>
                        <svg className="ok" viewBox="0 0 20 20">
                          <path
                            d="M4 10.5l4 4 8-9"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span>{copyLabel}</span>
                    </button>
                  </div>
                </div>

                <HostShowcase
                  locale={locale}
                  pre={copy.hostsPre}
                  post={copy.hostsPost}
                  slotAria={copy.slotAria}
                  listPrefix={copy.hostListPrefix}
                />

                <ul className="trust">
                  {copy.trustItems.map((item) => (
                    <li key={item}>
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path
                          d="M4 10.5l4 4 8-9"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <HeroVideo locale={locale} copy={copy} />
            </div>
          </div>

          <HorizonWave syncSignal={syncSignal} label={copy.inPhase} />
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot__in">
          <span>{copy.footBy}</span>
          <span className="foot__mission">{copy.mission}</span>
        </div>
      </footer>

      <p className="sr" aria-live="polite">
        {copyState === 'copied'
          ? copy.liveCopied
          : copyState === 'fallback'
            ? copy.copyFallback
            : ''}
      </p>
    </div>
  )
}
