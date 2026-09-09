/** Small horizontal proportion bar used inside table rows and rank lists. */
export function MiniBar({ fraction, color }: { fraction: number; color: string }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <div className="minibar">
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}
