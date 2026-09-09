// German number, time and duration formatting — the only formatting the apps use.

export function deInt(n: number): string {
  return n.toLocaleString('de-DE')
}

export function dePct(n: number, digits = 1): string {
  if (!isFinite(n)) return '–'
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`
}

export function deHours(h: number): string {
  if (!isFinite(h)) return '–'
  return `${h.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Std.`
}

export function dePT(pt: number): string {
  if (!isFinite(pt)) return '–'
  return `${pt.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Personentage`
}

export function deDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleString('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** `2026-09-08` → "8. September 2026" */
export function deDate(day: string | Date): string {
  const d = typeof day === 'string' ? new Date(`${day}T12:00:00`) : day
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** `2026-09-08` → "08.09.2026" */
export function deDateShort(day: string | Date): string {
  const d = typeof day === 'string' ? new Date(`${day}T12:00:00`) : day
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Duration in ms -> "4 Min. 12 Sek.", "1 Std. 03 Min.", "870 ms" */
export function deDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '–'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} Sek.`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} Min. ${String(s % 60).padStart(2, '0')} Sek.`
  const h = Math.floor(m / 60)
  return `${h} Std. ${String(m % 60).padStart(2, '0')} Min.`
}

export function deDelta(current: number, previous: number): { text: string; direction: 'up' | 'down' | 'flat' } {
  if (previous === 0 && current === 0) return { text: '±0', direction: 'flat' }
  if (previous === 0) return { text: 'neu', direction: 'up' }
  const pct = ((current - previous) / previous) * 100
  // Non-breaking space before the unit: the delta pill must never wrap.
  if (Math.abs(pct) < 0.05) return { text: '±0 %', direction: 'flat' }
  const sign = pct > 0 ? '+' : ''
  return { text: `${sign}${pct.toFixed(1).replace('.', ',')} %`, direction: pct > 0 ? 'up' : 'down' }
}
