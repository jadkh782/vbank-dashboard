import { describe, expect, it } from 'vitest'
import { familyKey } from '../src/classification/family'
import { normalizeMessage } from '../src/classification/normalize'

// Synthetic cases; expected keys were computed once with family.py.
describe('familyKey', () => {
  it('replaces selectors, quoted and bracketed values', () => {
    expect(familyKey("Could not find the UI element corresponding to this selector: <webctrl id='btnOk' /> in 'Konto anlegen' (Retry 3)", 'app')).toBe(
      "could not find the ui element corresponding to this selector: <selector> in '…' (…)",
    )
  })

  it('drops the .NET stack trace of a job fault (the " System.Exception:" split needs a leading blank)', () => {
    expect(
      familyKey(
        'Initialization failed 3 times. Please check log messages! System.Exception: Initialization failed 3 times.   at UiPath.Core.Activities.Rethrow',
        'job',
      ),
    ).toBe('initialization failed <n> times. please check log messages! system.exception: initialization failed <n> times')
  })

  it('treats umlauts as word characters (IBAN after "für")', () => {
    expect(familyKey('Kein Mandat für DE89370400440532013000 gefunden', 'app')).toBe(
      'kein mandat für <iban> gefunden',
    )
  })

  it('collapses number runs; a long value after a colon that starts with digits keeps its <n> form', () => {
    expect(familyKey('Auftrag 12/34/2026 abgelehnt. Hash: 0123456789abcdef0123', 'app')).toBe(
      'auftrag <n>abgelehnt. hash: <n>abcdef<n>',
    )
  })

  it('normalises files and decimals', () => {
    expect(familyKey('Datei Report_2026_08.xlsx konnte nicht gelesen werden (Größe 12,5 MB)', 'app')).toBe(
      'datei <file> konnte nicht gelesen werden (…)',
    )
  })

  it('truncates to 140 code points and trims punctuation', () => {
    const long = `– ${'ä'.repeat(150)} –`
    expect(familyKey(long, 'app')).toBe('ä'.repeat(140))
  })
})

describe('normalizeMessage', () => {
  it('strips ids, times, paths, hex and long numbers', () => {
    expect(
      normalizeMessage(
        'Job faulted: 6f9619ff-8b86-d011-b42d-00c04fc964ff at 2026-09-09T02:00:00Z reading C:\\exports\\batch_12345.csv code 0x1f',
      ),
    ).toBe('<id> at <time> reading <path>') // the path rule swallows the trailing words too
  })
})
