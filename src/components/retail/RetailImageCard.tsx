import { Expand, Image as ImageIcon, RefreshCw } from 'lucide-react'
import type { RetailImagePlan, RetailProjectSlot } from '../../types'

interface RetailImageCardProps {
  plan: RetailImagePlan
  slot: RetailProjectSlot
  imageSrc?: string
  disabled?: boolean
  onGenerate: () => void
  onOpen: () => void
}

const STATUS_LABELS: Record<RetailProjectSlot['status'], string> = {
  idle: '待生成',
  queued: '排队中',
  running: '生成中',
  done: '已完成',
  error: '失败',
}

export default function RetailImageCard({ plan, slot, imageSrc, disabled, onGenerate, onOpen }: RetailImageCardProps) {
  return (
    <article className={`retail-image-card status-${slot.status}`}>
      <div className="retail-image-preview">
        {imageSrc ? (
          <button type="button" onClick={onOpen} aria-label={`查看${plan.label}`}>
            <img src={imageSrc} alt={plan.label} />
            <span className="retail-image-expand"><Expand size={15} /></span>
          </button>
        ) : (
          <div className="retail-image-empty">
            <ImageIcon size={26} strokeWidth={1.5} />
            <span>{plan.targetSize.width}×{plan.targetSize.height}</span>
          </div>
        )}
        {(slot.status === 'running' || slot.status === 'queued') && (
          <div className="retail-image-loading"><span /></div>
        )}
      </div>
      <div className="retail-image-card-body">
        <div className="retail-image-title-row">
          <div>
            <span>{String(plan.order).padStart(2, '0')}</span>
            <h3>{plan.label}</h3>
          </div>
          <span className={`retail-status status-${slot.status}`}>{STATUS_LABELS[slot.status]}</span>
        </div>
        <p>{plan.objective.split('；')[0]}</p>
        <div className="retail-image-card-actions">
          <span>{plan.composeMode === 'none' ? 'AI 场景' : '精准排版'}</span>
          <button
            type="button"
            title={slot.status === 'done' ? '重新生成' : '生成此图'}
            aria-label={slot.status === 'done' ? '重新生成' : '生成此图'}
            disabled={disabled || slot.status === 'running' || slot.status === 'queued'}
            onClick={onGenerate}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        {slot.error && <div className="retail-slot-error" title={slot.error}>{slot.error}</div>}
      </div>
    </article>
  )
}
