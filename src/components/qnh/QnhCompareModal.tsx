import { useEffect, useState } from 'react'
import { Minus, Plus, RotateCcw, X } from 'lucide-react'

interface QnhCompareModalProps {
  sourceUrl: string
  outputUrl?: string
  sourceLabel?: string
  outputLabel?: string
  onClose: () => void
}

function ComparePane({ url, label }: { url: string; label: string }) {
  const [zoom, setZoom] = useState(1)
  return (
    <section className="qnh-compare-pane">
      <header>
        <strong>{label}</strong>
        <div>
          <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.5))} disabled={zoom <= 1} aria-label={`${label}缩小`} title="缩小">
            <Minus size={16} />
          </button>
          <span>{zoom.toFixed(1)}x</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(5, value + 0.5))} disabled={zoom >= 5} aria-label={`${label}放大`} title="放大">
            <Plus size={16} />
          </button>
          <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label={`${label}重置缩放`} title="重置缩放">
            <RotateCcw size={15} />
          </button>
        </div>
      </header>
      <div className="qnh-compare-canvas">
        <img src={url} alt={label} style={{ width: `${zoom * 100}%` }} />
      </div>
    </section>
  )
}

export default function QnhCompareModal({
  sourceUrl,
  outputUrl,
  sourceLabel = '真实来源图',
  outputLabel = '拟写入图',
  onClose,
}: QnhCompareModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="qnh-compare-backdrop" role="dialog" aria-modal="true" aria-label="图片保真对比" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className={`qnh-compare-dialog ${outputUrl ? '' : 'is-single'}`}>
        <div className="qnh-compare-topbar">
          <div>
            <strong>{outputUrl ? '包装保真对比' : '图片检查'}</strong>
            <span>{outputUrl ? '两侧可独立放大，逐字核对包装与规格' : '可放大检查微缩文字与标识'}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭图片检查" title="关闭">
            <X size={20} />
          </button>
        </div>
        <div className="qnh-compare-grid">
          <ComparePane url={sourceUrl} label={sourceLabel} />
          {outputUrl && <ComparePane url={outputUrl} label={outputLabel} />}
        </div>
      </div>
    </div>
  )
}
