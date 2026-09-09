import { CATEGORY_LABELS_DE, CATEGORY_ORDER, type Category, type Confidence } from '@vbank/shared'
import type { DayState, ReviewStatus } from '../data/types'

const CONFIDENCE_LABELS: Record<Confidence, string> = { hoch: 'hoch', mittel: 'mittel', niedrig: 'niedrig' }

export function ConfidenceBadge({ confidence }: { confidence: Confidence | null }) {
  if (!confidence) return <span className="conf conf-none">kein Vorschlag</span>
  return <span className={`conf conf-${confidence}`}>{CONFIDENCE_LABELS[confidence]}</span>
}

export function DayStatusBadge({ state, openCount, stale }: { state: DayState; openCount: number; stale?: boolean }) {
  if (state === 'published') return <span className={`day-status published${stale ? ' stale' : ''}`}>{stale ? 'veröffentlicht · geändert' : 'veröffentlicht'}</span>
  if (openCount === 0) return <span className="day-status ready">bereit</span>
  return <span className="day-status open">offen · {openCount}</span>
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const label = status === 'confirmed' ? 'bestätigt' : status === 'info' ? 'Info' : 'offen'
  return <span className={`review-status ${status}`}>{label}</span>
}

/** All six categories, incl. "Nicht als Fehler anzeigen", in review order. */
export const SELECTABLE_CATEGORIES: Category[] = [...CATEGORY_ORDER, 'nicht_anzeigen']

export function CategorySelect({
  value,
  onChange,
  disabled,
  placeholder = 'Kategorie wählen…',
  id,
}: {
  value: Category | null
  onChange: (c: Category) => void
  disabled?: boolean
  placeholder?: string
  id?: string
}) {
  return (
    <select id={id} className="cat-select" value={value ?? ''} disabled={disabled} onChange={(e) => e.target.value && onChange(e.target.value as Category)}>
      <option value="" disabled>
        {placeholder}
      </option>
      {SELECTABLE_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {CATEGORY_LABELS_DE[c]}
        </option>
      ))}
    </select>
  )
}
