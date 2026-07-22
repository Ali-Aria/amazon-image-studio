import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type Ref } from 'react'

interface SheetProps {
  children: ReactNode
  onClose: () => void
  className?: string
  rootClassName?: string
  panelRef?: Ref<HTMLDivElement>
  labelledBy?: string
  closeOnBackdrop?: boolean
}

const DISMISS_DISTANCE = 72

export function Sheet({
  children,
  onClose,
  className = '',
  rootClassName = 'z-[70]',
  panelRef,
  labelledBy,
  closeOnBackdrop = true,
}: SheetProps) {
  const dragStartY = useRef<number | null>(null)
  const dragOffsetRef = useRef(0)
  const [dragOffset, setDragOffset] = useState(0)

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragStartY.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return
    const nextOffset = Math.max(0, event.clientY - dragStartY.current)
    dragOffsetRef.current = nextOffset
    setDragOffset(nextOffset)
  }

  const finishDrag = () => {
    dragStartY.current = null
    if (dragOffsetRef.current >= DISMISS_DISTANCE) {
      onClose()
    }
    dragOffsetRef.current = 0
    setDragOffset(0)
  }

  const panelStyle: CSSProperties | undefined = dragOffset
    ? { transform: `translateY(${dragOffset}px)`, transition: 'none' }
    : undefined

  return (
    <div
      data-no-drag-select
      className={`ios-sheet-root fixed inset-0 ${rootClassName}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="ios-sheet-backdrop absolute inset-0"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div ref={panelRef} className={`ios-sheet-panel ${className}`} style={panelStyle}>
        <div
          className="ios-sheet-grabber-zone"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          aria-hidden="true"
        >
          <span className="ios-sheet-grabber" />
        </div>
        {children}
      </div>
    </div>
  )
}
