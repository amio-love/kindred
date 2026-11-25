import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Locale } from './i18n'

interface HostItem {
  id: string
  name: string
  icon: string
  accent: string
  glow: string
  lightPlate?: boolean
  roundAvatar?: boolean
}

const HOSTS_BY_LOCALE: Record<Locale, readonly HostItem[]> = {
  zh: [
    {
      id: 'doubao',
      name: '豆包',
      icon: '/icons/doubao.png',
      accent: '#f43f5e',
      glow: 'rgba(244, 63, 94, 0.3)',
      roundAvatar: true,
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      icon: '/icons/deepseek.svg',
      accent: '#4d6bfe',
      glow: 'rgba(77, 107, 254, 0.32)',
      lightPlate: true,
    },
    {
      id: 'workbuddy',
      name: 'WorkBuddy',
      icon: '/icons/workbuddy.svg',
      accent: '#10b981',
      glow: 'rgba(16, 185, 129, 0.3)',
    },
    {
      id: 'kimi',
      name: 'Kimi',
      icon: '/icons/kimi.svg',
      accent: '#1783ff',
      glow: 'rgba(23, 131, 255, 0.3)',
    },
    {
      id: 'qwen',
      name: '通义千问',
      icon: '/icons/qwen.svg',
      accent: '#6366f1',
      glow: 'rgba(99, 102, 241, 0.3)',
      lightPlate: true,
    },
    {
      id: 'yuanbao',
      name: '元宝',
      icon: '/icons/yuanbao.svg',
      accent: '#22c55e',
      glow: 'rgba(34, 197, 94, 0.28)',
    },
    {
      id: 'muse',
      name: 'Meta Muse',
      icon: '/icons/muse.svg',
      accent: '#0082fb',
      glow: 'rgba(0, 130, 251, 0.3)',
      lightPlate: true,
    },
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      icon: '/icons/chatgpt.svg',
      accent: '#10a37f',
      glow: 'rgba(16, 163, 127, 0.28)',
    },
    {
      id: 'claude',
      name: 'Claude',
      icon: '/icons/claude.svg',
      accent: '#e07a52',
      glow: 'rgba(224, 122, 82, 0.3)',
    },
    {
      id: 'openclaw',
      name: 'OpenClaw',
      icon: '/icons/openclaw.svg',
      accent: '#ff5c35',
      glow: 'rgba(255, 92, 53, 0.32)',
    },
  ],
  en: [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      icon: '/icons/chatgpt.svg',
      accent: '#10a37f',
      glow: 'rgba(16, 163, 127, 0.28)',
    },
    {
      id: 'claude',
      name: 'Claude',
      icon: '/icons/claude.svg',
      accent: '#e07a52',
      glow: 'rgba(224, 122, 82, 0.3)',
    },
    {
      id: 'grok',
      name: 'Grok',
      icon: '/icons/grok.svg',
      accent: '#f7f4ee',
      glow: 'rgba(247, 244, 238, 0.22)',
    },
    {
      id: 'gemini',
      name: 'Gemini',
      icon: '/icons/gemini.svg',
      accent: '#4285f4',
      glow: 'rgba(66, 133, 244, 0.32)',
    },
    {
      id: 'perplexity',
      name: 'Perplexity',
      icon: '/icons/perplexity.svg',
      accent: '#20b2aa',
      glow: 'rgba(32, 178, 170, 0.3)',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      icon: '/icons/deepseek.svg',
      accent: '#4d6bfe',
      glow: 'rgba(77, 107, 254, 0.32)',
      lightPlate: true,
    },
    {
      id: 'muse',
      name: 'Meta Muse',
      icon: '/icons/muse.svg',
      accent: '#0082fb',
      glow: 'rgba(0, 130, 251, 0.3)',
      lightPlate: true,
    },
    {
      id: 'openclaw',
      name: 'OpenClaw',
      icon: '/icons/openclaw.svg',
      accent: '#ff5c35',
      glow: 'rgba(255, 92, 53, 0.32)',
    },
  ],
}

interface HostShowcaseProps {
  locale: Locale
  label: string
  moreBadge: string
  openProtocolNote: string
}

export default function HostShowcase({
  locale,
  label,
  moreBadge,
  openProtocolNote,
}: HostShowcaseProps) {
  const hosts = HOSTS_BY_LOCALE[locale]
  const [activeIdx, setActiveIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    setActiveIdx(0)
  }, [locale])

  useEffect(() => {
    if (paused) return
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const timer = window.setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % hosts.length)
    }, 2400)
    return () => window.clearInterval(timer)
  }, [paused, hosts.length])

  const currentIdx = activeIdx % hosts.length
  const active = hosts[currentIdx]!

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let nextIdx: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIdx = (idx + 1) % hosts.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIdx = (idx - 1 + hosts.length) % hosts.length
    } else if (event.key === 'Home') {
      nextIdx = 0
    } else if (event.key === 'End') {
      nextIdx = hosts.length - 1
    }
    if (nextIdx === null) return
    event.preventDefault()
    setPaused(true)
    setActiveIdx(nextIdx)
    tabRefs.current[nextIdx]?.focus()
  }

  return (
    <div
      className="host-showcase"
      style={{
        ['--host-accent' as string]: active.accent,
        ['--host-glow' as string]: active.glow,
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="host-top-row">
        <div className="host-reel-group">
          <span className="host-prefix">{label}</span>
          <div className="host-slot" aria-live="polite">
            <div key={`${locale}-${active.id}`} className="host-active-pill">
              <span
                className={`host-icon-badge ${active.lightPlate ? 'host-icon-badge--light' : ''}`}
              >
                <img
                  src={active.icon}
                  alt=""
                  width={20}
                  height={20}
                  className={`host-logo-img ${active.roundAvatar ? 'host-logo-round' : ''}`}
                />
              </span>
              <span className="host-active-name">{active.name}</span>
            </div>
          </div>
        </div>
        <span className="host-more-chip">{moreBadge}</span>
      </div>

      <div className="host-dock-row">
        <div className="host-pills" data-count={hosts.length} role="tablist" aria-label={label}>
          {hosts.map((host, idx) => {
            const isCurrent = idx === currentIdx
            return (
              <button
                key={host.id}
                ref={(el) => {
                  tabRefs.current[idx] = el
                }}
                type="button"
                role="tab"
                tabIndex={isCurrent ? 0 : -1}
                aria-selected={isCurrent}
                aria-label={host.name}
                title={host.name}
                className={`host-dot-btn ${isCurrent ? 'host-dot-btn--active' : ''}`}
                style={isCurrent ? { borderColor: host.accent } : undefined}
                onClick={() => {
                  setActiveIdx(idx)
                  setPaused(true)
                }}
                onKeyDown={(event) => handleTabKeyDown(event, idx)}
              >
                <span className={host.lightPlate ? 'host-logo-plate' : 'host-logo-wrap'}>
                  <img
                    src={host.icon}
                    alt=""
                    width={18}
                    height={18}
                    className={`host-dot-img ${host.roundAvatar ? 'host-logo-round' : ''}`}
                  />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <span className="host-open-note">{openProtocolNote}</span>
    </div>
  )
}
