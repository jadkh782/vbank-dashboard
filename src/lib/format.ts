export function fmtInt(n: number): string {
  return n.toLocaleString('en-US')
}

/** Compact form for stat tiles: 1,284 / 12.9K / 4.2M */
export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}K`
  return fmtInt(n)
}

export function fmtPct(n: number, digits = 1): string {
  if (!isFinite(n)) return '–'
  return `${n.toFixed(digits)}%`
}

/** Duration in ms -> "4m 12s", "1h 03m", "870ms" */
export function fmtDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '–'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
}

export function fmtDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Hours with one decimal: 153.3 h */
export function fmtHours(h: number): string {
  if (!isFinite(h)) return '–'
  return `${h.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} h`
}

/** Person-days: 19.51 PT */
export function fmtPT(pt: number): string {
  if (!isFinite(pt)) return '–'
  return `${pt.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} PT`
}

export function fmtDelta(current: number, previous: number): { text: string; direction: 'up' | 'down' | 'flat' } {
  if (previous === 0 && current === 0) return { text: '±0', direction: 'flat' }
  if (previous === 0) return { text: 'new', direction: 'up' }
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.05) return { text: '±0%', direction: 'flat' }
  const sign = pct > 0 ? '+' : ''
  return { text: `${sign}${pct.toFixed(1)}%`, direction: pct > 0 ? 'up' : 'down' }
}
