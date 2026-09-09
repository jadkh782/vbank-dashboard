import { CATEGORY_HINTS_DE, CATEGORY_LABELS_PLURAL_DE, CATEGORY_ORDER, deInt, dePct, type Category } from '@vbank/shared'
import { useChartTheme } from '@vbank/ui'

/**
 * "Wer muss handeln" — splits every open point in the window by category. A
 * Neustartfähiger Vorgang belongs to nobody: it is listed, neutral, and
 * simply run again.
 */
export function CategorySplit({ counts, businessExceptions }: { counts: Record<Category, number>; businessExceptions: number }) {
  const t = useChartTheme()
  const shown = CATEGORY_ORDER.filter((c) => counts[c] > 0)
  const total = shown.reduce((a, c) => a + counts[c], 0)

  if (total === 0) {
    return <div className="state-block">Keine offenen Punkte — es besteht kein Handlungsbedarf.</div>
  }

  return (
    <div className="cat-split">
      <div className="cat-bar">
        {shown.map((c) => (
          <span
            key={c}
            className="cat-seg"
            style={{ width: `${(counts[c] / total) * 100}%`, background: t.category[c] }}
            title={`${CATEGORY_LABELS_PLURAL_DE[c]}: ${deInt(counts[c])}`}
          />
        ))}
      </div>

      {shown.map((c) => (
        <div className="cat-row" key={c}>
          <span className="dot" style={{ background: t.category[c] }} />
          <span className="grow">
            <b>{CATEGORY_LABELS_PLURAL_DE[c]}</b>
            <div className="dim">{CATEGORY_HINTS_DE[c]}</div>
          </span>
          <span className="cat-count">
            <b>{deInt(counts[c])}</b>
            <span className="dim">{dePct((counts[c] / total) * 100, 0)}</span>
          </span>
        </div>
      ))}

      {businessExceptions > 0 ? (
        <div className="cat-note">
          Zusätzlich wurden <b>{deInt(businessExceptions)}</b> Vorgänge korrekt ausgesteuert und liegen beim Fachbereich zur
          manuellen Bearbeitung — das ist kein Fehler.
        </div>
      ) : null}
    </div>
  )
}
