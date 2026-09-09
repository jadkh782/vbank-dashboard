import { describe, expect, it } from 'vitest'
import { suggest, type MappingRow } from '../src/classification/suggest'

const input = { kind: 'app' as const, messageNorm: 'HTTP 503 from Kernbanksystem', familyKey: 'http <n> from kernbanksystem', recovered: false }
const none = { message: null, family: null, keywordFallback: ['server', 'timeout', '503'] }
const row = (category: MappingRow['category'], counts: MappingRow['categoryCounts'] = {}, decidedCount = 0): MappingRow => ({
  category,
  decidedCount,
  categoryCounts: counts,
})

describe('suggest', () => {
  it('recovered chains are Neustartfähig with high confidence, before anything else', () => {
    expect(suggest({ ...input, recovered: true }, { ...none, message: row('vbank_it') })).toMatchObject({
      category: 'neustartfaehig',
      confidence: 'hoch',
      source: 'recovered',
    })
  })

  it('business exceptions are never shown as errors', () => {
    expect(suggest({ ...input, kind: 'biz' }, none)).toMatchObject({ category: 'nicht_anzeigen', confidence: 'hoch' })
  })

  it('an exact message mapping beats the family mapping', () => {
    const s = suggest(input, { ...none, message: row('avaloq', { avaloq: 3 }, 3), family: row('vbank_it') })
    expect(s).toMatchObject({ category: 'avaloq', confidence: 'hoch', source: 'message' })
  })

  it('a workbook-only message mapping counts as unanimous', () => {
    expect(suggest(input, { ...none, message: row('vbank_it') })).toMatchObject({ confidence: 'hoch' })
  })

  it('mixed decisions lower the confidence and follow the majority', () => {
    const s = suggest(input, { ...none, message: row('vbank_it', { vbank_it: 2, avaloq: 2 }, 4) })
    expect(s).toMatchObject({ category: 'vbank_it', confidence: 'mittel' })
    const f = suggest(input, { ...none, family: row('vbank_it', { vbank_it: 1, exelentic_uipath: 2 }, 3) })
    expect(f).toMatchObject({ category: 'exelentic_uipath', confidence: 'niedrig', source: 'family' })
  })

  it('family mappings are mittel until five decisions agree', () => {
    expect(suggest(input, { ...none, family: row('vbank_it', { vbank_it: 2 }, 2) })).toMatchObject({ confidence: 'mittel' })
    expect(suggest(input, { ...none, family: row('vbank_it', { vbank_it: 6 }, 6) })).toMatchObject({ confidence: 'hoch' })
  })

  it('falls back to the infrastructure keywords with low confidence, else null', () => {
    expect(suggest(input, none)).toMatchObject({ category: 'vbank_it', confidence: 'niedrig', source: 'keyword' })
    expect(suggest({ ...input, messageNorm: 'Selector not found' }, none)).toBeNull()
  })
})
