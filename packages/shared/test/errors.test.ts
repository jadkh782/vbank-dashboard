import { describe, expect, it } from 'vitest'
import { normalizeMessage } from '../src/errors'

describe('workspace wiring', () => {
  it('runs a test against the moved source tree', () => {
    expect(normalizeMessage('Job faulted: timeout 12345 at 2026-09-09T02:00:00Z')).toBe(
      'timeout <n> at <time>',
    )
  })
})
