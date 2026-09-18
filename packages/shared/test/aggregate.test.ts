import { describe, expect, it } from 'vitest'
import { buildStakeholderCards, healthStrip, runKpis, scorecard, txnKpis, volumeOverTime } from '../src'
import type { Automation, Run, Txn } from '../src'

const q: Automation = { id: 'q:1', kind: 'queue', technicalName: 'W-1', folder: 'F', displayName: 'W-1', description: null, humanMinutesPerItem: null }
const p: Automation = { id: 'p:1', kind: 'process', technicalName: 'A-1', folder: 'F', displayName: 'A-1', description: null, humanMinutesPerItem: null }
const thresholds = { okMin: 90, attentionMin: 75 }

const txn = (outcome: Txn['outcome'], category: Txn['category'] = null, i = 0): Txn => ({
  automationId: 'q:1',
  day: '2026-09-10',
  createdAt: `2026-09-10T0${i % 9}:00:00Z`,
  startedAt: null,
  endedAt: null,
  outcome,
  attempts: 1,
  processingMs: null,
  category,
  family: category ? 'x' : null,
})
const run = (state: Run['state'], category: Run['category'] = null): Run => ({
  automationId: 'p:1',
  day: '2026-09-10',
  createdAt: '2026-09-10T05:00:00Z',
  startedAt: null,
  endedAt: null,
  state,
  category,
  family: null,
})

describe('restartable failures are neutral', () => {
  // 6 successes, 4 restartable failures, 0 real failures → 100 % correct, not "gestört".
  const txns = [
    ...Array.from({ length: 6 }, (_, i) => txn('success', null, i)),
    ...Array.from({ length: 4 }, (_, i) => txn('failed', 'neustartfaehig', i)),
  ]

  it('txnKpis keeps them out of failed and processed', () => {
    const k = txnKpis(txns)
    expect(k.failed).toBe(0)
    expect(k.restartable).toBe(4)
    expect(k.processed).toBe(6)
    expect(k.successRate).toBe(100)
  })

  it('a real failure still counts', () => {
    const k = txnKpis([...txns, txn('failed', 'vbank_it')])
    expect(k.failed).toBe(1)
    expect(k.successRate).toBeCloseTo((6 / 7) * 100)
  })

  it('the stakeholder card stays ok and the strip never shows red', () => {
    const [card] = buildStakeholderCards([q], [], txns, [], [], thresholds)
    expect(card.count).toBe(10)
    expect(card.successRate).toBe(100)
    expect(card.health).toBe('ok')
    const from = new Date('2026-09-10T00:00:00Z')
    const to = new Date('2026-09-10T23:59:59Z')
    const strip = healthStrip(card, [], txns, from, to, thresholds)
    expect(strip.every((c) => c.health === 'ok' || c.health === 'idle')).toBe(true)
  })

  it('applies to faulted runs reviewed as Neustartfähig too', () => {
    const runs = [run('success'), run('success'), run('faulted', 'neustartfaehig'), run('faulted', 'neustartfaehig')]
    const k = runKpis(runs)
    expect(k.faulted).toBe(0)
    expect(k.restartable).toBe(2)
    expect(k.successRate).toBe(100)
    const [card] = buildStakeholderCards([p], runs, [], [], [], thresholds)
    expect(card.health).toBe('ok')
    expect(buildStakeholderCards([p], [run('success'), run('faulted', 'vbank_it')], [], [], [], thresholds)[0].health).toBe('critical')
  })

  it('scorecard and volume chart show them as their own bucket', () => {
    const [row] = scorecard([q], txns, [])
    expect(row.failed).toBe(0)
    expect(row.restartable).toBe(4)
    const v = volumeOverTime(txns, new Date('2026-09-10T00:00:00Z'), new Date('2026-09-10T23:59:59Z'))
    const sum = (k: 'Korrekt verarbeitet' | 'Nicht erfolgreich' | 'Neustartfähig') => v.rows.reduce((a, r) => a + r[k], 0)
    expect(sum('Neustartfähig')).toBe(4)
    expect(sum('Nicht erfolgreich')).toBe(0)
    expect(sum('Korrekt verarbeitet')).toBe(6)
  })
})
