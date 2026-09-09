import { describe, expect, it } from 'vitest'
import { collapseRetries, linkByReference, type ChainItem } from '../src/chains/collapse'
import { chainOutcome, processingMs, recovered } from '../src/chains/outcome'

const item = (o: Partial<ChainItem> & { id: number }): ChainItem => ({
  queueId: 7,
  status: 'Successful',
  exceptionType: null,
  reason: null,
  creationTime: `2026-09-09T08:0${o.id % 10}:00Z`,
  startProcessing: `2026-09-09T08:1${o.id % 10}:00Z`,
  endProcessing: `2026-09-09T08:1${o.id % 10}:30Z`,
  reference: 'VB-1',
  ancestorId: null,
  manualAncestorId: null,
  retryNumber: 0,
  ...o,
})

describe('collapseRetries', () => {
  it('folds a failed → retried → successful chain into one successful transaction', () => {
    const items = [
      item({ id: 1, status: 'Retried', exceptionType: 'ApplicationException', reason: 'HTTP 503' }),
      item({ id: 2, status: 'Retried', exceptionType: 'ApplicationException', reason: 'HTTP 503', ancestorId: 1, retryNumber: 1 }),
      item({ id: 3, status: 'Successful', ancestorId: 2, retryNumber: 2 }),
      item({ id: 4, reference: 'VB-2' }),
    ]
    const chains = collapseRetries(items)
    expect(chains).toHaveLength(2)
    const c = chains.find((x) => x.rootId === 1)!
    expect(c.attempts.map((a) => a.id)).toEqual([1, 2, 3])
    expect(c.retryCount).toBe(2)
    expect(chainOutcome(c.final)).toBe('successful')
    expect(recovered(c)).toBe(true)
    expect(processingMs(c)).toBe(90_000) // three attempts × 30 s
  })

  it('keeps the last attempt failed as one failure', () => {
    const chains = collapseRetries([
      item({ id: 1, status: 'Retried', exceptionType: 'ApplicationException' }),
      item({ id: 2, status: 'Failed', exceptionType: 'ApplicationException', ancestorId: 1, retryNumber: 1 }),
    ])
    expect(chains).toHaveLength(1)
    expect(chainOutcome(chains[0].final)).toBe('failed')
    expect(recovered(chains[0])).toBe(false)
  })

  it('treats an orphan Retried item as pending, not as a failure', () => {
    const chains = collapseRetries([item({ id: 1, status: 'Retried', exceptionType: 'ApplicationException' })])
    expect(chainOutcome(chains[0].final)).toBe('pending')
  })

  it('links manual retries (RetryNumber 0) through ManualAncestorId and orders by depth', () => {
    const chains = collapseRetries([
      item({ id: 5, status: 'Successful', manualAncestorId: 4, creationTime: '2026-09-09T09:00:00Z' }),
      item({ id: 4, status: 'Retried', exceptionType: 'ApplicationException', creationTime: '2026-09-09T08:00:00Z' }),
    ])
    expect(chains[0].rootId).toBe(4)
    expect(chains[0].attempts.map((a) => a.id)).toEqual([4, 5])
    expect(chains[0].retryCount).toBe(1)
  })

  it('heads a chain with the earliest fetched attempt when the root is missing', () => {
    const chains = collapseRetries([item({ id: 9, status: 'Successful', ancestorId: 8, retryNumber: 1 })])
    expect(chains[0].rootId).toBe(9)
    expect(chains[0].retryCount).toBe(1) // RetryNumber still tells the truth
  })
})

describe('linkByReference', () => {
  it('fills AncestorId for a Retried item followed by a same-reference item', () => {
    const linked = linkByReference([
      item({ id: 1, status: 'Retried', exceptionType: 'ApplicationException', creationTime: '2026-09-09T08:00:00Z' }),
      item({ id: 2, status: 'Successful', creationTime: '2026-09-09T08:05:00Z' }),
    ])
    expect(linked.find((i) => i.id === 2)!.ancestorId).toBe(1)
    expect(collapseRetries(linked)).toHaveLength(1)
  })
})
