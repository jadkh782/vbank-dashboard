import { describe, expect, it } from 'vitest'
import { presetRange } from './WindowContext'

describe('presetRange', () => {
  it('anchors every preset to the Datenstand, never to now', () => {
    const d = '2026-09-08'
    const one = presetRange('1d', d)
    expect(one.from.toISOString()).toBe('2026-09-07T22:00:00.000Z') // 00:00 Berlin (CEST)
    expect(one.to.toISOString()).toBe('2026-09-08T21:59:59.999Z') // end of the Datenstand day
    const week = presetRange('7d', d)
    expect(week.from.toISOString()).toBe('2026-09-01T22:00:00.000Z')
    expect(week.to).toEqual(one.to)
    const month = presetRange('30d', d)
    expect(month.from.toISOString()).toBe('2026-08-09T22:00:00.000Z')
  })
})
