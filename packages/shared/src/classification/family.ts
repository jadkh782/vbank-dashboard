// Family key: groups normalised messages that differ only in values (names,
// numbers, file names, selectors, stack traces) into one "Fehlerfamilie".
//
// This is a port of tools/classification/family.py, which produced the
// workbook's "Muster" column. It must stay byte-identical to the Python
// version — test/family.equivalence.test.ts checks every exported variant.
// Python's `re` is Unicode-aware where JS needs the `u` flag and explicit
// classes: `\d` → \p{Nd}, `\b` → lookarounds on [\p{L}\p{N}_].

export type ErrorKind = 'job' | 'app' | 'biz'

const WORD = '[\\p{L}\\p{N}_]'
const NOT_BEFORE_WORD = `(?<!${WORD})`
const NOT_AFTER_WORD = `(?!${WORD})`

const STACK_TYPE = new RegExp(
  `\\s(?:System|UiPath|Microsoft|Newtonsoft)\\.[A-Za-z0-9_.]+(?:Exception|Error)${NOT_AFTER_WORD}`,
  'u',
)
const STACK_AT = /\s(?:at|bei)\s+[A-Za-z_]+\./u
const SELECTOR = /<[a-z]+ [^>]*>/gu
const DOUBLE_QUOTED = /"[^"]*"/gu
const SINGLE_QUOTED = /'[^']*'/gu
const PARENS = /\([^()]*\)/gu
const FILE = new RegExp(`\\S+\\.(?:csv|xlsx?|xlsm|pdf|txt|xml|json|docx?|msg|zip)${NOT_AFTER_WORD}`, 'giu')
const IBAN = new RegExp(`${NOT_BEFORE_WORD}[A-Z]{2}\\p{Nd}{2}[A-Z0-9]{10,30}${NOT_AFTER_WORD}`, 'gu')
const DECIMAL = /\p{Nd}+[.,]\p{Nd}+/gu
const DIGITS = /\p{Nd}+/gu
const N_CHAIN = /<n>(?:[.,]<n>)+/gu
const N_RUNS = /(?:<n>[-/ ]?){2,}/gu
const LONG_VALUE = /(?<=[:=]) ?\S{16,}/gu
const SPACES = /\s+/gu
const TRIM = /^[ .:;,\-–]+|[ .:;,\-–]+$/gu

export function familyKey(message: string, kind: ErrorKind): string {
  let m = message
  if (kind === 'job') {
    // Job faults: keep only the leading message, drop ".NET type + stack trace".
    m = m.split(STACK_TYPE)[0]
    m = m.split(STACK_AT)[0]
  }
  m = m.replace(SELECTOR, '<selector>')
  m = m.replace(DOUBLE_QUOTED, '"…"')
  m = m.replace(SINGLE_QUOTED, "'…'")
  m = m.replace(PARENS, '(…)')
  m = m.replace(FILE, '<file>')
  m = m.replace(IBAN, '<iban>')
  m = m.replace(DECIMAL, '<n>')
  m = m.replace(DIGITS, '<n>')
  m = m.replace(N_CHAIN, '<n>')
  m = m.replace(N_RUNS, '<n>')
  m = m.replace(LONG_VALUE, ' <wert>') // long tokens after a colon (ids, hashes)
  m = m.replace(SPACES, ' ').replace(TRIM, '')
  m = m.toLowerCase()
  const cps = Array.from(m)
  if (cps.length > 140) m = cps.slice(0, 140).join('')
  return m
}
