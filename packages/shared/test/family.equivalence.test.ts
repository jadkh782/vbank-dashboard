import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { familyKey, type ErrorKind } from '../src/classification/family'

// Oracle produced by tools/classification/dump_family_keys.py from the full
// Orchestrator export. It holds customer names, so it is gitignored; the test
// runs wherever the fixture exists (the developer's machine).
const FIXTURE = fileURLToPath(new URL('./fixtures/family-keys.json', import.meta.url))

describe('familyKey parity with family.py', () => {
  it.skipIf(!existsSync(FIXTURE))('produces the same key for every exported variant', () => {
    const rows = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { kind: ErrorKind; message: string; key: string }[]
    expect(rows.length).toBeGreaterThan(1000)
    const diffs: string[] = []
    for (const r of rows) {
      const got = familyKey(r.message, r.kind)
      if (got !== r.key) diffs.push(`${r.kind} | ${r.message}\n   py: ${r.key}\n   ts: ${got}`)
    }
    expect(diffs, `${diffs.length} of ${rows.length} keys differ:\n${diffs.slice(0, 20).join('\n')}`).toEqual([])
  })
})
