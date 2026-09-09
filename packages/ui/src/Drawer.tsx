import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Slide-over drawer shell: backdrop, dialog semantics, Esc to close, body
 * scroll lock, focus into the panel and back to the trigger on close.
 *
 * Focus is restored by `focusKey` rather than by node reference: React may
 * replace the trigger element on re-render, so the original node is detached
 * by the time the drawer closes. The trigger marks itself with
 * `data-card-key={focusKey}`.
 */
export function Drawer({
  titleId,
  focusKey,
  onClose,
  children,
}: {
  titleId: string
  focusKey: string
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      const trigger = document.querySelector<HTMLElement>(`[data-card-key="${CSS.escape(focusKey)}"]`)
      trigger?.focus()
    }
  }, [onClose, focusKey])

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside className="detail-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={panelRef}>
        {children}
      </aside>
    </>
  )
}
