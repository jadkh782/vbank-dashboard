import type { Category } from '../categories'
import type { ErrorKind } from './family'

export type Confidence = 'hoch' | 'mittel' | 'niedrig'

/** A learned or imported mapping row (message- or family-level). */
export interface MappingRow {
  category: Category
  /** How many human decisions fed this row (0 for a pure workbook import). */
  decidedCount: number
  /** Decisions per category, e.g. { vbank_it: 4, avaloq: 1 }. */
  categoryCounts: Partial<Record<Category, number>>
}

export interface SuggestInput {
  kind: ErrorKind
  messageNorm: string
  familyKey: string
  /** Chain failed at least once but ended successfully. */
  recovered: boolean
}

export interface SuggestLookup {
  message: MappingRow | null
  family: MappingRow | null
  /** Legacy infrastructure keywords — the weakest signal, kept as a last resort. */
  keywordFallback: string[]
}

export interface Suggestion {
  category: Category
  confidence: Confidence
  source: 'recovered' | 'business' | 'message' | 'family' | 'keyword'
  reason: string
}

function majority(row: MappingRow): { category: Category; unanimous: boolean } {
  const entries = Object.entries(row.categoryCounts).filter(([, n]) => (n ?? 0) > 0) as [Category, number][]
  if (entries.length === 0) return { category: row.category, unanimous: true }
  const total = entries.reduce((a, [, n]) => a + n, 0)
  entries.sort((a, b) => b[1] - a[1])
  const [top, n] = entries[0]
  return { category: top, unanimous: entries.length === 1 || n / total >= 0.8 }
}

/**
 * Suggest a category for a review item. Pure: the caller loads the mapping rows.
 * Order of evidence: recovered chain → business exception → exact normalised
 * message → family → keyword → nothing (the item is flagged as unknown).
 */
export function suggest(input: SuggestInput, lookup: SuggestLookup): Suggestion | null {
  if (input.recovered) {
    return { category: 'neustartfaehig', confidence: 'hoch', source: 'recovered', reason: 'Nach Neustart erfolgreich' }
  }
  if (input.kind === 'biz') {
    return { category: 'nicht_anzeigen', confidence: 'hoch', source: 'business', reason: 'Business Exception' }
  }
  if (lookup.message) {
    const m = majority(lookup.message)
    return {
      category: m.category,
      confidence: m.unanimous ? 'hoch' : 'mittel',
      source: 'message',
      reason: m.unanimous
        ? `Meldung bekannt (${lookup.message.decidedCount || 'Arbeitsmappe'})`
        : 'Meldung bekannt, Entscheidungen uneinheitlich',
    }
  }
  if (lookup.family) {
    const m = majority(lookup.family)
    const confidence: Confidence = !m.unanimous ? 'niedrig' : lookup.family.decidedCount >= 5 ? 'hoch' : 'mittel'
    return {
      category: m.category,
      confidence,
      source: 'family',
      reason: m.unanimous ? 'Fehlerfamilie bekannt' : 'Fehlerfamilie bekannt, Entscheidungen uneinheitlich',
    }
  }
  const lower = input.messageNorm.toLowerCase()
  const hit = lookup.keywordFallback.find((k) => k.trim() !== '' && lower.includes(k.trim().toLowerCase()))
  if (hit) {
    return { category: 'vbank_it', confidence: 'niedrig', source: 'keyword', reason: `Schlüsselwort „${hit.trim()}“` }
  }
  return null
}
