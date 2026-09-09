// Import the classification workbook (Vbank-Fehlerklassifizierung*.xlsx):
//   Fehler / Business Exceptions  → mapping_families   (Muster, Neue Einstufung)
//   Varianten (Detail)            → mapping_messages   (normalised message → family's category)
//   Prozesse & Warteschlangen     → automations.included (Einbeziehen Ja/Nein)
// Re-runnable. Decisions made in the Control Board (source = 'decision') are
// kept unless --force. Every variant's TypeScript family key is compared with
// the workbook's Muster; mismatches abort unless --allow-mismatch.

import ExcelJS from 'exceljs'
import { familyKey, labelToCategory, type Category, type ErrorKind } from '@vbank/shared'
import { db, check, upsertChunked } from '../db/client'
import { log } from '../log'

interface Options {
  force: boolean
  allowMismatch: boolean
}

function kindOf(typ: string): ErrorKind {
  const t = typ.toLowerCase()
  if (t.startsWith('job')) return 'job'
  if (t.startsWith('business')) return 'biz'
  return 'app'
}

function headerIndex(ws: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>()
  ws.getRow(1).eachCell((cell, col) => map.set(String(cell.value ?? '').trim(), col))
  return map
}

const cellText = (row: ExcelJS.Row, col: number | undefined): string => {
  if (!col) return ''
  const v = row.getCell(col).value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'richText' in (v as object)) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('')
  if (typeof v === 'object' && 'result' in (v as object)) return String((v as ExcelJS.CellFormulaValue).result ?? '')
  return String(v)
}

export async function importWorkbook(path: string, opts: Options): Promise<void> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.readFile(path)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EBUSY' || code === 'EACCES') throw new Error(`${path} ist gesperrt — bitte Excel schließen.`)
    throw e
  }

  // existing decisions are protected
  const decidedFamilies = new Set<string>()
  const decidedMessages = new Set<string>()
  if (!opts.force) {
    for (const r of (check(await db().from('mapping_families').select('kind, family_key').eq('source', 'decision'), 'load families') as { kind: string; family_key: string }[]) ?? [])
      decidedFamilies.add(`${r.kind}::${r.family_key}`)
    for (const r of (check(await db().from('mapping_messages').select('kind, message_norm').eq('source', 'decision'), 'load messages') as { kind: string; message_norm: string }[]) ?? [])
      decidedMessages.add(`${r.kind}::${r.message_norm}`)
  }

  // ── families ──
  const familyCategory = new Map<string, { kind: ErrorKind; key: string; category: Category | null }>() // by Nr
  const familyRows: Record<string, unknown>[] = []
  let unmapped = 0
  for (const sheetName of ['Fehler', 'Business Exceptions']) {
    const ws = wb.getWorksheet(sheetName)
    if (!ws) {
      log.warn(`sheet "${sheetName}" not found`)
      continue
    }
    const h = headerIndex(ws)
    ws.eachRow((row, n) => {
      if (n === 1) return
      const nr = cellText(row, h.get('Nr'))
      if (!nr) return
      const kind = kindOf(cellText(row, h.get('Typ')))
      const key = cellText(row, h.get('Muster'))
      const category = labelToCategory(cellText(row, h.get('Neue Einstufung')))
      familyCategory.set(nr, { kind, key, category })
      if (!category) {
        unmapped++
        return
      }
      if (decidedFamilies.has(`${kind}::${key}`)) return
      familyRows.push({ kind, family_key: key, category, workbook_nr: nr, source: 'workbook', last_seen: new Date().toISOString() })
    })
  }

  // ── variants → messages (+ parity check) ──
  const messageRows: Record<string, unknown>[] = []
  const mismatches: string[] = []
  const wsV = wb.getWorksheet('Varianten (Detail)')
  if (wsV) {
    const h = headerIndex(wsV)
    wsV.eachRow((row, n) => {
      if (n === 1) return
      const nr = cellText(row, h.get('Familie Nr'))
      const fam = familyCategory.get(nr)
      if (!fam) return
      const message = cellText(row, h.get('Normalisierte Meldung'))
      const computed = familyKey(message, fam.kind)
      if (computed !== fam.key) mismatches.push(`${nr}: ${message.slice(0, 80)}\n    ts: ${computed}\n    xl: ${fam.key}`)
      if (!fam.category || decidedMessages.has(`${fam.kind}::${message}`)) return
      messageRows.push({ kind: fam.kind, message_norm: message, category: fam.category, source: 'workbook' })
    })
  }
  if (mismatches.length) {
    log.error(`${mismatches.length} family-key mismatches between TypeScript and the workbook:\n  ${mismatches.slice(0, 10).join('\n  ')}`)
    if (!opts.allowMismatch) throw new Error('Aborted: family keys differ (fix familyKey or pass --allow-mismatch).')
  }

  // ── include / exclude ──
  const wsP = wb.getWorksheet('Prozesse & Warteschlangen')
  let included = 0
  let excluded = 0
  const unmatched: string[] = []
  if (wsP) {
    const h = headerIndex(wsP)
    const automations = (check(await db().from('automations').select('id, kind, technical_name, folder_name'), 'load automations') as {
      id: string
      kind: string
      technical_name: string
      folder_name: string
    }[]) ?? []
    const updates: { id: string; included: boolean }[] = []
    wsP.eachRow((row, n) => {
      if (n === 1) return
      const decision = cellText(row, h.get('Einbeziehen')).trim().toLowerCase()
      if (decision !== 'ja' && decision !== 'nein') return
      const kind = cellText(row, h.get('Typ')).toLowerCase().startsWith('warte') ? 'queue' : 'process'
      const name = cellText(row, h.get('Name'))
      const folder = cellText(row, h.get('Ordner'))
      const a = automations.find((x) => x.kind === kind && x.technical_name === name && x.folder_name === folder)
      if (!a) {
        unmatched.push(`${kind} ${folder} / ${name}`)
        return
      }
      updates.push({ id: a.id, included: decision === 'ja' })
    })
    for (const u of updates) {
      check(await db().from('automations').update({ included: u.included, is_new: false }).eq('id', u.id), 'update automation')
      if (u.included) included++
      else excluded++
    }
  }

  const nf = familyRows.length ? await upsertChunked('mapping_families', familyRows, 'kind,family_key') : 0
  const nm = messageRows.length ? await upsertChunked('mapping_messages', messageRows, 'kind,message_norm') : 0
  check(
    await db().from('audit_log').insert({
      action: 'workbook_import',
      entity: 'mapping',
      entity_id: path,
      after: { families: nf, messages: nm, unmapped, included, excluded, unmatched: unmatched.length, mismatches: mismatches.length },
    }),
    'audit',
  )
  log.info(`workbook: ${nf} families, ${nm} messages imported; ${unmapped} families without decision; include ${included} / exclude ${excluded}; ${unmatched.length} rows unmatched`)
  if (unmatched.length) log.warn(`unmatched:\n  ${unmatched.slice(0, 20).join('\n  ')}`)
}
