export function fmtInt(n: number): string {
  return n.toLocaleString('de-DE')
}

/** Duration in ms -> "4 Min. 12 Sek.", "1 Std. 03 Min.", "870 ms" */
export function fmtDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '–'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} Sek.`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} Min. ${String(s % 60).padStart(2, '0')} Sek.`
  const h = Math.floor(m / 60)
  return `${h} Std. ${String(m % 60).padStart(2, '0')} Min.`
}

export function fmtDelta(current: number, previous: number): { text: string; direction: 'up' | 'down' | 'flat' } {
  if (previous === 0 && current === 0) return { text: '±0', direction: 'flat' }
  if (previous === 0) return { text: 'neu', direction: 'up' }
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.05) return { text: '±0 %', direction: 'flat' }
  const sign = pct > 0 ? '+' : ''
  return { text: `${sign}${pct.toFixed(1).replace('.', ',')} %`, direction: pct > 0 ? 'up' : 'down' }
}
