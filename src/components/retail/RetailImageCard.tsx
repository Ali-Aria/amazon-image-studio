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
  const specialUnavailable = plan.id === '08-special' && !plan.generationEligible
  const statusLabel = specialUnavailable ? '需资料' : STATUS_LABELS[slot.status]
  const actionLabel = plan.processingMode === 'source-only'
    ? '原件适配'
    : plan.processingMode === 'deterministic'
      ? '精准排版'
      : plan.processingMode === 'ai-preserve'
        ? 'AI 保真合成'
        : plan.composeMode === 'none' ? 'AI 场景' : '精准排版'
  const [objectiveBase, ...objectiveRest] = plan.objective.split('；类目建议：')
  const categoryHint = objectiveRest.join('；类目建议：').trim()

  return (
    <article className={`retail-image-card status-${slot.status} ${specialUnavailable ? 'is-unavailable' : ''}`}>
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
          <span className={`retail-status ${specialUnavailable ? 'status-needs' : `status-${slot.status}`}`}>{statusLabel}</span>
        </div>
        {/* 曾经写成 split('；')[0]，把「类目建议：…」整段吞掉——23 个类目共 184 条方向
            一条都显示不出来。改成拆开显示，类目那半句才是这一位真正的差异所在。 */}
        <p title={plan.objective}>{objectiveBase}</p>
        {categoryHint && <p className="retail-image-card-hint" title={categoryHint}>{categoryHint}</p>}
        <div className="retail-image-card-actions">
          <span>{actionLabel}</span>
          <button
            type="button"
            title={slot.status === 'done' ? '重新生成' : '生成此图'}
            aria-label={slot.status === 'done' ? '重新生成' : '生成此图'}
            disabled={disabled || specialUnavailable || slot.status === 'running' || slot.status === 'queued'}
            onClick={onGenerate}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        {slot.error && <div className="retail-slot-error" title={slot.error}>{slot.error}</div>}
        {!slot.error && specialUnavailable && plan.blockedReason && <div className="retail-slot-note" title={plan.blockedReason}>{plan.blockedReason}</div>}
      </div>
    </article>
  )
}
