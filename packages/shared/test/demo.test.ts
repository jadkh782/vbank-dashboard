import { describe, expect, it } from 'vitest'
import { generateDemoData } from '../src/demo/generate'

describe('demo generator', () => {
  const to = new Date('2026-09-08T21:59:59Z')
  const from = new Date(to.getTime() - 14 * 24 * 3600_000)

  it('is deterministic for the same window', () => {
    const a = generateDemoData({ from, to })
    const b = generateDemoData({ from, to })
    expect(a.txns.length).toBe(b.txns.length)
    expect(a.runs.length).toBe(b.runs.length)
    expect(a.datenstand).toBe('2026-09-08')
  })

  it('collapses retries: recovered transactions are successes with attempts > 1', () => {
    const d = generateDemoData({ from, to })
    const recovered = d.txns.filter((t) => t.outcome === 'success' && t.attempts > 1)
    const failed = d.txns.filter((t) => t.outcome === 'failed')
    expect(recovered.length).toBeGreaterThan(0)
    expect(failed.length).toBeGreaterThan(0)
    expect(failed.every((t) => t.category !== null && t.family !== null)).toBe(true)
    expect(d.txns.filter((t) => t.outcome === 'ignored').every((t) => t.category === null)).toBe(true)
  })

  it('covers every automation in a two-week window', () => {
    const d = generateDemoData({ from, to })
    const active = new Set([...d.runs.map((r) => r.automationId), ...d.txns.map((t) => t.automationId)])
    expect(d.automations.every((a) => active.has(a.id))).toBe(true)
  })
})
