import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { HOST_ORDER, HOSTS, type HostId, type Locale } from './i18n'

interface HostShowcaseProps {
  locale: Locale
  pre: string
  post: string
  slotAria: string
  listPrefix: string
}

interface SlotEntry {
  key: number
  hostId: HostId
  state: 'idle' | 'in' | 'out'
}

function pickHostId(list: readonly HostId[], idx: number): HostId {
  return list[idx % list.length] ?? 'doubao'
}

export default function HostShowcase({ locale, pre, post, slotAria, listPrefix }: HostShowcaseProps) {
  const order = HOST_ORDER[locale]
  const [index, setIndex] = useState(0)
  const [entries, setEntries] = useState<SlotEntry[]>(() => [
    { key: 1, hostId: pickHostId(order, 0), state: 'idle' },
  ])
  const [slotWidth, setSlotWidth] = useState<number | undefined>(undefined)

  const keyCounterRef = useRef(1)
  const measureRef = useRef<HTMLSpanElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const pausedRef = useRef(false)
  const visibleRef = useRef(true)
  const localeRef = useRef(locale)

  const currentHostId = pickHostId(order, index)
  const currentHost = HOSTS[currentHostId]

  const measureCurrentWidth = useCallback(() => {
    const el = measureRef.current
    if (!el) return
    const width = Math.ceil(el.getBoundingClientRect().width)
    if (width > 0) setSlotWidth(width)
  }, [])

  useLayoutEffect(() => {
    measureCurrentWidth()
  }, [currentHostId, locale, measureCurrentWidth])

  useEffect(() => {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measureCurrentWidth).catch(() => {})
    }
  }, [measureCurrentWidth])

  useEffect(() => {
    if (localeRef.current === locale) return
    localeRef.current = locale
    const nextOrder = HOST_ORDER[locale]
    const nextHostId = pickHostId(nextOrder, index)
    keyCounterRef.current += 1
    setEntries([{ key: keyCounterRef.current, hostId: nextHostId, state: 'idle' }])
  }, [locale, index])

  const advance = useCallback(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    setIndex((prevIdx) => {
      const list = HOST_ORDER[localeRef.current]
      const nextIdx = (prevIdx + 1) % list.length
      const nextHostId = pickHostId(list, nextIdx)
      keyCounterRef.current += 1
      const nextKey = keyCounterRef.current

      if (prefersReduced) {
        setEntries([{ key: nextKey, hostId: nextHostId, state: 'idle' }])
      } else {
        setEntries((prev) => {
          const active = prev[prev.length - 1]
          if (!active) return [{ key: nextKey, hostId: nextHostId, state: 'in' }]
          return [
            { ...active, state: 'out' },
            { key: nextKey, hostId: nextHostId, state: 'in' },
          ]
        })
      }
      return nextIdx
    })
  }, [])

  useEffect(() => {
    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      if (pausedRef.current || !visibleRef.current || document.hidden) return
      timer = window.setTimeout(() => {
        advance()
        schedule()
      }, 2300)
    }

    const btn = buttonRef.current
    const onEnter = () => {
      pausedRef.current = true
      schedule()
    }
    const onLeave = () => {
      pausedRef.current = false
      schedule()
    }
    const onVis = () => schedule()

    btn?.addEventListener('mouseenter', onEnter)
    btn?.addEventListener('mouseleave', onLeave)
    btn?.addEventListener('focus', onEnter)
    btn?.addEventListener('blur', onLeave)
    document.addEventListener('visibilitychange', onVis)

    let observer: IntersectionObserver | null = null
    if (btn && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((items) => {
        visibleRef.current = items[items.length - 1]?.isIntersecting ?? true
        schedule()
      })
      observer.observe(btn)
    }

    schedule()
    return () => {
      window.clearTimeout(timer)
      btn?.removeEventListener('mouseenter', onEnter)
      btn?.removeEventListener('mouseleave', onLeave)
      btn?.removeEventListener('focus', onEnter)
      btn?.removeEventListener('blur', onLeave)
      document.removeEventListener('visibilitychange', onVis)
      observer?.disconnect()
    }
  }, [advance])

  const handleExitEnd = useCallback((exitedKey: number) => {
    setEntries((prev) => prev.filter((item) => item.key !== exitedKey || item.state !== 'out'))
  }, [])

  const hostSummary =
    listPrefix +
    order.map((id) => HOSTS[id][locale]).join(locale === 'zh' ? '、' : ', ')

  return (
    <div className="hosts">
      <span>{pre}</span>
      <button
        ref={buttonRef}
        type="button"
        className="slot"
        style={slotWidth ? { width: `${slotWidth}px` } : undefined}
        aria-label={`${currentHost[locale]} — ${slotAria}`}
        onClick={advance}
      >
        <span ref={measureRef} className="slot__item slot__measure" aria-hidden="true">
          <span className={`plate${currentHost.plate ? ` plate--${currentHost.plate}` : ''}`}>
            <img src={currentHost.icon} alt="" width={16} height={16} decoding="async" />
          </span>
          <span>{currentHost[locale]}</span>
        </span>
        {entries.map((entry) => {
          const host = HOSTS[entry.hostId]
          return (
            <span
              key={entry.key}
              className={`slot__item${entry.state === 'in' ? ' in' : entry.state === 'out' ? ' out' : ''}`}
              onAnimationEnd={() => {
                if (entry.state === 'out') handleExitEnd(entry.key)
              }}
            >
              <span className={`plate${host.plate ? ` plate--${host.plate}` : ''}`}>
                <img src={host.icon} alt="" width={16} height={16} decoding="async" />
              </span>
              <span>{host[locale]}</span>
            </span>
          )
        })}
      </button>
      <span>{post}</span>
      <span className="sr">{hostSummary}</span>
    </div>
  )
}
