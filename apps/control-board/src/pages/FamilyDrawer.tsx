import { Link } from 'react-router-dom'
import { CATEGORY_LABELS_DE, deDate, deDateTime, deInt, type Category, type ErrorKind } from '@vbank/shared'
import { CategoryBadge, Drawer } from '@vbank/ui'
import { CategorySelect, ReviewStatusBadge } from '../components/Badges'
import { displayNameOf, useAutomationRows } from '../data/queries'
import { useFamilyCases, type CaseSelector } from '../data/familyCases'

const KIND_LABELS: Record<ErrorKind, string> = { job: 'Prozessabbruch', app: 'Systemausnahme', biz: 'Business Exception' }

/**
 * One catalogue row opened: what the cause looks like in real cases, where and
 * when it happened, how those cases were decided — and the category control.
 */
export function FamilyDrawer({
  selector,
  title,
  category,
  source,
  focusKey,
  onCategory,
  onClose,
}: {
  selector: CaseSelector
  /** Normalised cause / message shown as the heading. */
  title: string
  /** Current mapping, null when the row is still "ohne Zuordnung". */
  category: Category | null
  source?: string | null
  focusKey: string
  onCategory: (c: Category) => void
  onClose: () => void
}) {
  const automations = useAutomationRows()
  const cases = useFamilyCases(selector)
  const nameOf = (id: string) => displayNameOf(automations.data?.find((a) => a.id === id))

  const rows = cases.data ?? []
  const open = rows.filter((c) => c.review?.status === 'open').length
  const decided = rows.filter((c) => c.review?.status === 'confirmed')
  const byCat = new Map<Category, number>()
  for (const c of decided) if (c.review?.category) byCat.set(c.review.category, (byCat.get(c.review.category) ?? 0) + 1)
  const autos = [...new Set(rows.map((c) => c.automation_id))]

  return (
    <Drawer titleId="family-drawer-title" focusKey={focusKey} onClose={onClose}>
      <header className="panel-head">
        <div>
          <div className="panel-kicker">
            {KIND_LABELS[selector.kind]} · {selector.family_key !== undefined ? 'Familie' : 'Meldung'}
          </div>
          <h2 id="family-drawer-title" className="panel-title family-title">
            {title}
          </h2>
          <div className="panel-status">
            {category ? <CategoryBadge category={category} /> : <span className="badge-missing">ohne Zuordnung</span>}
            {source ? <span className="dim">· {source === 'workbook' ? 'aus der Arbeitsmappe' : 'Entscheidung im Control Board'}</span> : null}
          </div>
        </div>
        <button className="panel-close" onClick={onClose} aria-label="Schließen">
          ×
        </button>
      </header>

      <div className="panel-body">
        <section>
          <div className="panel-section-title">Kategorie</div>
          <div className="decision">
            <label className="form-field">
              <span>{category ? 'Zuordnung ändern' : 'Zuordnung festlegen — gilt für alle künftigen Fälle dieser Ursache'}</span>
              <CategorySelect value={category} onChange={onCategory} />
            </label>
            {selector.family_key !== undefined ? (
              <div className="dim family-key" title={selector.family_key}>
                Familie: {selector.family_key}
              </div>
            ) : null}
          </div>
        </section>

        <section>
          <div className="panel-section-title">
            Fälle <span className="dim">· {cases.isLoading ? '…' : `${deInt(rows.length)}${rows.length >= 80 ? '+' : ''} zuletzt`}</span>
          </div>
          {rows.length > 0 ? (
            <div className="panel-figures">
              <div>
                <span className="dim">Offen</span>
                <b>{deInt(open)}</b>
              </div>
              <div>
                <span className="dim">Bestätigt</span>
                <b>{deInt(decided.length)}</b>
              </div>
              <div>
                <span className="dim">Automatisierungen</span>
                <b>{deInt(autos.length)}</b>
              </div>
              {[...byCat.entries()].map(([c, n]) => (
                <div key={c}>
                  <span className="dim">{CATEGORY_LABELS_DE[c]}</span>
                  <b>{deInt(n)}</b>
                </div>
              ))}
            </div>
          ) : null}
          {cases.error ? <div className="error-banner">{(cases.error as Error).message}</div> : null}
          {!cases.isLoading && rows.length === 0 ? <div className="dim">Keine gespeicherten Fälle zu dieser Ursache.</div> : null}
          {rows.map((c) => (
            <div className="attempt" key={`${c.source}-${c.id}`}>
              <div className="attempt-head">
                <b>{nameOf(c.automation_id)}</b>
                <span className="dim">
                  {deDateTime(c.time)} · {c.status}
                  {c.review ? (
                    <>
                      {' · '}
                      <ReviewStatusBadge status={c.review.status} />
                      {c.review.category ? (
                        <>
                          {' '}
                          <CategoryBadge category={c.review.category} />
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {' · '}
                  <Link to={`/tage/${c.business_day}`} onClick={onClose}>
                    Tag {deDate(c.business_day)}
                  </Link>
                </span>
              </div>
              {c.raw ? <pre className="attempt-block case-raw">{c.raw.split('\n').slice(0, 6).join('\n')}</pre> : null}
            </div>
          ))}
        </section>
      </div>
    </Drawer>
  )
}
