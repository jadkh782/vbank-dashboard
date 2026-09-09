import type { Chain, ChainItem } from './collapse'
import type { ErrorKind } from '../classification/family'

/** Outcome of a transaction, judged by its final attempt. */
export type ChainOutcome = 'successful' | 'business_exception' | 'failed' | 'pending' | 'deleted'

export function chainOutcome(final: ChainItem): ChainOutcome {
  switch (final.status) {
    case 'Successful':
      return 'successful'
    case 'Failed':
    case 'Abandoned':
      return final.exceptionType === 'BusinessException' ? 'business_exception' : 'failed'
    case 'Deleted':
      return 'deleted'
    // New, InProgress — and an orphan 'Retried' whose copy was not fetched: not
    // decided yet, never counted as a failure.
    default:
      return 'pending'
  }
}

/** Σ measured processing time over all attempts (true machine time); null if none. */
export function processingMs(chain: Chain): number | null {
  let sum = 0
  let any = false
  for (const a of chain.attempts) {
    if (!a.startProcessing || !a.endProcessing) continue
    const d = new Date(a.endProcessing).getTime() - new Date(a.startProcessing).getTime()
    if (d >= 0) {
      sum += d
      any = true
    }
  }
  return any ? sum : null
}

/** Which review family a chain's message belongs to. */
export function reviewKind(final: ChainItem): ErrorKind {
  return final.exceptionType === 'BusinessException' ? 'biz' : 'app'
}

/** A chain that failed at least once but ended well — the "Neustartfähiger Vorgang" success case. */
export function recovered(chain: Chain): boolean {
  const o = chainOutcome(chain.final)
  return chain.wasRetried && (o === 'successful' || o === 'business_exception')
}

/** The reason of the last failed attempt (for recovered chains, the one before success). */
export function lastFailureReason(chain: Chain): string | null {
  for (let i = chain.attempts.length - 1; i >= 0; i--) {
    const a = chain.attempts[i]
    if (a.reason && (a.status === 'Failed' || a.status === 'Abandoned' || a.status === 'Retried')) return a.reason
  }
  return null
}
