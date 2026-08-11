import { FileCheck2, ShieldCheck } from 'lucide-react'
import type {
  RetailSpecialImageEvaluation,
  RetailSpecialImageType,
} from '../../types'

interface SpecialImageControlsProps {
  evaluation: RetailSpecialImageEvaluation
  value: RetailSpecialImageType | 'auto'
  disabled?: boolean
  onChange: (value: RetailSpecialImageType | 'auto') => void
}

const STATE_LABELS = {
  ready: '可生成',
  'needs-fields': '需补字段',
  'needs-upload': '需真实资料',
  'not-applicable': '暂不适用',
} as const

export default function SpecialImageControls({ evaluation, value, disabled, onChange }: SpecialImageControlsProps) {
  const requested = value === 'auto'
    ? evaluation
    : evaluation.options.find((option) => option.type === value) ?? evaluation
  const fallback = value !== 'auto' && requested.type !== evaluation.selectedType

  return (
    <section className="retail-section retail-special-controls" aria-labelledby="special-image-title">
      <div className="retail-section-heading">
        <div>
          <FileCheck2 size={16} />
          <h2 id="special-image-title">平台特殊图</h2>
        </div>
        <span className={`retail-special-state state-${requested.state}`}>{STATE_LABELS[requested.state]}</span>
      </div>

      <label className="retail-field">
        <span>生成类型</span>
        <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as RetailSpecialImageType | 'auto')}>
          <option value="auto">自动选择 · {evaluation.label}</option>
          {evaluation.options.map((option) => (
            <option key={option.type} value={option.type}>
              {option.label} · {STATE_LABELS[option.state]}
            </option>
          ))}
        </select>
      </label>

      <div className={`retail-special-summary state-${requested.state}`}>
        <strong>{requested.label}</strong>
        <span>{requested.reason}</span>
        {fallback && <small>资料补齐前，任务板暂用“{evaluation.label}”。</small>}
        {requested.missingFields.length > 0 && (
          <div className="retail-special-missing">
            {requested.missingFields.map((field) => <b key={field}>{field}</b>)}
          </div>
        )}
      </div>

      <div className="retail-special-safety">
        <ShieldCheck size={14} />
        <span>证照、检测、备案与能效材料仅处理真实原件</span>
      </div>
    </section>
  )
}
