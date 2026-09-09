import { CATEGORY_LABELS_DE, type Category } from '@vbank/shared'
import { useChartTheme } from './theme'

/** Small horizontal proportion bar used inside table rows and rank lists. */
export function MiniBar({ fraction, color }: { fraction: number; color: string }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <div className="minibar">
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/** Colour never carries a category alone — the label is always part of the badge. */
export function CategoryBadge({ category }: { category: Category }) {
  const t = useChartTheme()
  return (
    <span className="cat-badge">
      <span className="dot" style={{ background: t.category[category] }} />
      {CATEGORY_LABELS_DE[category]}
    </span>
  )
}
