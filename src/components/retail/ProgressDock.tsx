import { Download, Pause, Play, Sparkles } from 'lucide-react'

interface ProgressDockProps {
  completed: number
  generating: boolean
  paused: boolean
  canGenerate: boolean
  onGenerate: () => void
  onPauseToggle: () => void
  onExport: () => void
}

export default function ProgressDock({ completed, generating, paused, canGenerate, onGenerate, onPauseToggle, onExport }: ProgressDockProps) {
  return (
    <div className="retail-mobile-dock" data-no-drag-select>
      <div><strong>{completed}/7</strong><span>图片</span></div>
      {generating ? (
        <button type="button" className="retail-dock-secondary" onClick={onPauseToggle}>
          {paused ? <Play size={17} /> : <Pause size={17} />}
          {paused ? '继续' : '暂停'}
        </button>
      ) : completed === 7 ? (
        <button type="button" className="retail-dock-primary" onClick={onExport}><Download size={17} />导出</button>
      ) : (
        <button type="button" className="retail-dock-primary" disabled={!canGenerate} onClick={onGenerate}><Sparkles size={17} />生成 7 图</button>
      )}
    </div>
  )
}
