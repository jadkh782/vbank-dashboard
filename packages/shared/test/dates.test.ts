import { describe, expect, it } from 'vitest'
import { buildBuckets, clampWindow } from '../src/dates'

describe('clampWindow', () => {
  const latest = new Date('2026-09-08T21:59:59.999Z')

  it('never lets the window end after the last published moment', () => {
    const r = clampWindow(new Date('2026-09-01T00:00:00Z'), new Date('2026-09-20T00:00:00Z'), latest)
    expect(r.to).toEqual(latest)
    expect(r.from).toEqual(new Date('2026-09-01T00:00:00Z'))
  })

  it('keeps from before to', () => {
    const r = clampWindow(new Date('2026-09-15T00:00:00Z'), new Date('2026-09-20T00:00:00Z'), latest)
    expect(r.to).toEqual(latest)
    expect(r.from.getTime()).toBe(latest.getTime() - 24 * 3600_000)
  })
})

describe('buildBuckets', () => {
  it('uses hours for a single day and days beyond two days', () => {
    const day = buildBuckets(new Date('2026-09-08T00:00:00'), new Date('2026-09-08T23:59:59'))
    expect(day.unit).toBe('hour')
    expect(day.buckets).toHaveLength(24)
    const week = buildBuckets(new Date('2026-09-02T00:00:00'), new Date('2026-09-08T23:59:59'))
    expect(week.unit).toBe('day')
    expect(week.buckets.map((b) => b.label)).toEqual(['02.09.', '03.09.', '04.09.', '05.09.', '06.09.', '07.09.', '08.09.'])
  })
})
