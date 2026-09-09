import type { ReactNode } from 'react'
import { MiniBar } from './Badges'
import { fmtInt, fmtPct } from '../../lib/format'

export interface RankItem {
  label: string
  sub?: ReactNode
  count: number
  share?: number // 0..1
  color: string
}

/** Ranked horizontal bar list — frequency tables that read like a chart. */
export function RankList({ items, emptyText = 'Nothing in the selected window.' }: { items: RankItem[]; emptyText?: string }) {
  if (items.length === 0) return <div className="state-block">{emptyText}</div>
  const max = Math.max(...items.map((i) => i.count))
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className="num dim" style={{ width: 24 }}>
                {i + 1}
              </td>
              <td>
                <div className="primary" style={{ overflowWrap: 'anywhere' }}>
                  {it.label}
                </div>
                {it.sub ? <div className="dim">{it.sub}</div> : null}
              </td>
              <td style={{ width: 140, verticalAlign: 'middle' }}>
                <MiniBar fraction={max > 0 ? it.count / max : 0} color={it.color} />
              </td>
              <td className="num" style={{ width: 70, fontWeight: 600 }}>
                {fmtInt(it.count)}
              </td>
              {it.share !== undefined ? (
                <td className="num dim" style={{ width: 60 }}>
                  {fmtPct(it.share * 100, 1)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
