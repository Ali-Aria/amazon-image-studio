import { useRef } from 'react'
import { FolderInput, Layers, PackageCheck } from 'lucide-react'
import type { RetailExportLayout } from '../../lib/retailExporter'

interface BatchPanelProps {
  projectCount: number
  running: boolean
  exporting: boolean
  progress: { done: number; total: number; failed: number } | null
  onImport: (files: File[]) => void
  onGenerate: () => void
  onExport: (layout: RetailExportLayout) => void
}

export default function BatchPanel({ projectCount, running, exporting, progress, onImport, onGenerate, onExport }: BatchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <section className="retail-section retail-batch" aria-labelledby="batch-title">
      <div className="retail-section-heading">
        <div>
          <Layers size={15} />
          <h2 id="batch-title">批量商品</h2>
        </div>
        <span className="retail-batch-count">{projectCount} 个项目</span>
      </div>

      <p className="retail-batch-note">
        图片文件名以条码开头即可，例如 <code>6941876270606.jpg</code>、<code>6941876270606_2.jpg</code>。
        同一条码的多张图归到一个商品，资料自动从主档带出。
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length > 0) onImport(files)
        }}
      />

      <button type="button" className="retail-batch-button" disabled={running} onClick={() => inputRef.current?.click()}>
        <FolderInput size={16} />
        {running ? '处理中' : '按条码批量导入图片'}
      </button>

      <button type="button" className="retail-batch-button" disabled={running || projectCount < 2} onClick={onGenerate}>
        <Layers size={16} />
        批量生成全部商品
      </button>

      <button type="button" className="retail-batch-button" disabled={exporting || projectCount < 2} onClick={() => onExport('meituan-batch')}>
        <PackageCheck size={16} />
        批量导出美团上传包
      </button>

      {progress && (
        <p className="retail-batch-progress">
          已完成 {progress.done}/{progress.total} 个商品
          {progress.failed > 0 ? ` · ${progress.failed} 张图片失败` : ''}
        </p>
      )}
    </section>
  )
}
