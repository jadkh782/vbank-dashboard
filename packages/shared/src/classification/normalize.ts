/**
 * Normalize an error message so identical failures group together:
 * strip GUIDs, timestamps, numbers-in-paths, hex ids and long digit runs,
 * collapse whitespace, and truncate.
 *
 * Kept byte-for-byte identical to the rule that produced the "Normalisierte
 * Meldung" column of the classification workbook — the mapping tables are keyed
 * by this output.
 */
export function normalizeMessage(raw: string): string {
  let m = raw
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g, '<time>')
    .replace(/(?:[A-Za-z]:)?[\\/](?:[\w .()-]+[\\/])+[\w .()-]+/g, '<path>')
    .replace(/0x[0-9a-f]+/gi, '<hex>')
    .replace(/\b\d{4,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
  // Many job Info fields lead with a fixed prefix; drop pure noise prefixes.
  m = m.replace(/^(job (has )?(faulted|stopped)[:.]?\s*)/i, '')
  if (m.length > 180) m = `${m.slice(0, 177)}…`
  return m || 'Unspecified error'
}
