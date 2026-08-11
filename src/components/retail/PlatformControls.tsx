import { LockKeyhole } from 'lucide-react'
import { RETAIL_PLATFORM_PRESETS } from '../../lib/retailPlatform'
import { RETAIL_STYLE_PRESETS } from '../../lib/retailPlanner'

interface PlatformControlsProps {
  platformPresetId: string
  styleId: string
  concurrency: number
  disabled?: boolean
  onPlatformPresetChange: (value: string) => void
  onStyleChange: (value: string) => void
  onConcurrencyChange: (value: number) => void
}

export default function PlatformControls({
  platformPresetId,
  styleId,
  concurrency,
  disabled,
  onPlatformPresetChange,
  onStyleChange,
  onConcurrencyChange,
}: PlatformControlsProps) {
  return (
    <section className="retail-section" aria-labelledby="output-settings-title">
      <div className="retail-section-heading">
        <div>
          <span className="retail-step-number">03</span>
          <h2 id="output-settings-title">平台与风格</h2>
        </div>
      </div>

      <label className="retail-field">
        <span>平台规格</span>
        <select
          value={platformPresetId}
          disabled={disabled}
          onChange={(event) => onPlatformPresetChange(event.target.value)}
        >
          {Object.values(RETAIL_PLATFORM_PRESETS).map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </select>
      </label>

      <label className="retail-field">
        <span>视觉风格</span>
        <select value={styleId} disabled={disabled} onChange={(event) => onStyleChange(event.target.value)}>
          {Object.entries(RETAIL_STYLE_PRESETS).map(([id, style]) => (
            <option key={id} value={id}>{style.label}</option>
          ))}
        </select>
      </label>

      <div className="retail-field">
        <span>并发任务</span>
        <div className="retail-segmented" aria-label="并发任务数">
          {[1, 2, 3].map((value) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              className={concurrency === value ? 'is-active' : ''}
              onClick={() => onConcurrencyChange(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="retail-fidelity-row">
        <LockKeyhole size={16} />
        <span>商品保真</span>
        <span className="retail-switch is-on" aria-label="商品保真已开启"><i /></span>
      </div>
    </section>
  )
}
