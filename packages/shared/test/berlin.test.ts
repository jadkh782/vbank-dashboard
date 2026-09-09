import { describe, expect, it } from 'vitest'
import { addDays, berlinDay, berlinDayEnd, berlinDayStart } from '../src/time/berlin'

describe('berlin day helpers', () => {
  it('assigns instants to the Berlin day, not the UTC day', () => {
    expect(berlinDay('2026-09-08T22:30:00Z')).toBe('2026-09-09') // CEST, UTC+2
    expect(berlinDay('2026-01-31T23:30:00Z')).toBe('2026-02-01') // CET, UTC+1
    expect(berlinDay('2026-09-09T21:59:59Z')).toBe('2026-09-09')
  })

  it('computes day boundaries across the DST switches', () => {
    expect(berlinDayStart('2026-09-09').toISOString()).toBe('2026-09-08T22:00:00.000Z')
    expect(berlinDayStart('2026-01-15').toISOString()).toBe('2026-01-14T23:00:00.000Z')
    // 29 Mar 2026: clocks go forward at 02:00 — the day starts at 23:00Z the night before,
    // the next day at 22:00Z.
    expect(berlinDayStart('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z')
    expect(berlinDayEnd('2026-03-29').toISOString()).toBe('2026-03-29T22:00:00.000Z')
    // 25 Oct 2026: clocks go back.
    expect(berlinDayStart('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z')
    expect(berlinDayEnd('2026-10-25').toISOString()).toBe('2026-10-25T23:00:00.000Z')
  })

  it('adds days across month ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})
