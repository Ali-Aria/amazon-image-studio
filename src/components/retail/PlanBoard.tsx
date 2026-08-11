import { Pause, Play, Sparkles } from 'lucide-react'
import type { RetailImagePlan, RetailProjectSlot, RetailSlotId } from '../../types'
import RetailImageCard from './RetailImageCard'

interface PlanBoardProps {
  plans: RetailImagePlan[]
  slots: RetailProjectSlot[]
  previews: Record<string, string>
  generating: boolean
  paused: boolean
  canGenerate: boolean
  onGenerateAll: () => void
  onPauseToggle: () => void
  onGenerateSlot: (slotId: RetailSlotId) => void
  onOpenImage: (slot: RetailProjectSlot) => void
}

export default function PlanBoard({
  plans,
  slots,
  previews,
  generating,
  paused,
  canGenerate,
  onGenerateAll,
  onPauseToggle,
  onGenerateSlot,
  onOpenImage,
}: PlanBoardProps) {
  const baseSlots = slots.filter((slot) => slot.slotId !== '08-special')
  const completed = baseSlots.filter((slot) => slot.status === 'done').length
  const specialPlan = plans.find((plan) => plan.id === '08-special')
  const specialDone = slots.find((slot) => slot.slotId === '08-special')?.status === 'done'
  const progress = Math.round((completed / 7) * 100)

  return (
    <section className="retail-board" aria-labelledby="retail-plan-title">
      <header className="retail-board-header">
        <div>
          <span className="retail-step-number">04</span>
          <div>
            <h2 id="retail-plan-title">7 张基础图 + 1 张特殊图</h2>
            <p>{completed}/7 基础图 · {specialDone ? '特殊图已完成' : specialPlan?.generationEligible ? '特殊图可生成' : '特殊图按需'}</p>
          </div>
        </div>
        <div className="retail-board-actions">
          {generating && (
            <button type="button" className="retail-icon-command" onClick={onPauseToggle} title={paused ? '继续队列' : '暂停队列'} aria-label={paused ? '继续队列' : '暂停队列'}>
              {paused ? <Play size={17} /> : <Pause size={17} />}
            </button>
          )}
          <button type="button" className="retail-primary-command" disabled={!canGenerate || generating} onClick={onGenerateAll}>
            <Sparkles size={17} />
            {completed > 0 ? '补齐未完成' : '一键生成图集'}
          </button>
        </div>
      </header>

      <div className="retail-progress-track" aria-label={`生成进度 ${progress}%`}><i style={{ width: `${progress}%` }} /></div>

      <div className="retail-image-grid">
        {plans.map((plan) => {
          const slot = slots.find((item) => item.slotId === plan.id)
          if (!slot) return null
          const imageSrc = (slot.composedImageId ? previews[slot.composedImageId] : undefined)
            || (slot.outputImageId ? previews[slot.outputImageId] : undefined)
          return (
            <RetailImageCard
              key={plan.id}
              plan={plan}
              slot={slot}
              imageSrc={imageSrc}
              disabled={generating}
              onGenerate={() => onGenerateSlot(plan.id)}
              onOpen={() => onOpenImage(slot)}
            />
          )
        })}
      </div>
    </section>
  )
}
