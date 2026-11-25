import { useEffect, useState } from 'react'

interface HostItem {
  id: string
  name: string
  accent: string
  glow: string
}

const HOSTS: readonly HostItem[] = [
  {
    id: 'muse',
    name: 'Meta Muse',
    accent: '#a78bfa',
    glow: 'rgba(167, 139, 250, 0.28)',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    accent: '#10a37f',
    glow: 'rgba(16, 163, 127, 0.28)',
  },
  {
    id: 'claude',
    name: 'Claude',
    accent: '#e07a52',
    glow: 'rgba(224, 122, 82, 0.28)',
  },
  {
    id: 'grok',
    name: 'Grok',
    accent: '#f7f4ee',
    glow: 'rgba(247, 244, 238, 0.22)',
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    accent: '#ff5c35',
    glow: 'rgba(255, 92, 53, 0.3)',
  },
] as const

function HostIcon({ id, size = 18 }: { id: string; size?: number }) {
  switch (id) {
    case 'muse':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4.5 14.5C4.5 11.5 6.8 9.2 9.4 10.6L14.6 13.4C17.2 14.8 19.5 12.5 19.5 9.5C19.5 6.8 17.2 5.2 14.8 6.8L9.2 17.2C6.8 18.8 4.5 17.2 4.5 14.5Z"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'chatgpt':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.9" />
          <path
            d="M12 3.5V7.5M12 16.5V20.5M4.6 7.8L8.1 9.8M15.9 14.2L19.4 16.2M19.4 7.8L15.9 9.8M8.1 14.2L4.6 16.2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="4 3.5" />
        </svg>
      )
    case 'claude':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2.5V21.5M2.5 12H21.5M5.3 5.3L18.7 18.7M18.7 5.3L5.3 18.7"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'grok':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="2.1" />
          <path d="M5 19L19 5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6.5 4.5L10 19.5M12 3.5V20.5M17.5 4.5L14 19.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      )
  }
}

interface HostShowcaseProps {
  label: string
}

export default function HostShowcase({ label }: HostShowcaseProps) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const timer = window.setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % HOSTS.length)
    }, 2100)
    return () => window.clearInterval(timer)
  }, [paused])

  const active = HOSTS[activeIdx]!

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
      <div className="host-reel-group">
        <span className="host-prefix">{label}</span>
        <div className="host-slot" aria-live="polite">
          <div key={active.id} className="host-active-pill">
            <span className="host-icon-badge" style={{ color: active.accent }}>
              <HostIcon id={active.id} size={18} />
            </span>
            <span className="host-active-name">{active.name}</span>
          </div>
        </div>
      </div>

      <div className="host-pills" role="tablist" aria-label={label}>
        {HOSTS.map((host, idx) => {
          const isCurrent = idx === activeIdx
          return (
            <button
              key={host.id}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              aria-label={host.name}
              title={host.name}
              className={`host-dot-btn ${isCurrent ? 'host-dot-btn--active' : ''}`}
              style={isCurrent ? { color: host.accent, borderColor: host.accent } : undefined}
              onClick={() => {
                setActiveIdx(idx)
                setPaused(true)
              }}
            >
              <HostIcon id={host.id} size={15} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
