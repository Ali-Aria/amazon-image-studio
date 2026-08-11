import { X } from 'lucide-react'
import SearchBar from '../SearchBar'
import TaskGrid from '../TaskGrid'

export default function RetailHistoryDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="retail-history-backdrop" role="dialog" aria-modal="true" aria-labelledby="retail-history-title" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="retail-history-dialog" data-drag-select-surface>
        <header>
          <div><span>任务记录</span><h2 id="retail-history-title">生成历史</h2></div>
          <button type="button" title="关闭" aria-label="关闭" onClick={onClose}><X size={19} /></button>
        </header>
        <SearchBar />
        <div className="retail-history-content"><TaskGrid /></div>
      </div>
    </div>
  )
}
