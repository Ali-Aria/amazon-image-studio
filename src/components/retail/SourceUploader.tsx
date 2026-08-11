import { ImagePlus, Trash2, UploadCloud } from 'lucide-react'
import type { InputImage, RetailSourceImageRole } from '../../types'

interface SourceUploaderProps {
  images: InputImage[]
  roles: Record<string, RetailSourceImageRole>
  disabled?: boolean
  onFiles: (files: File[]) => void
  onRemove: (id: string) => void
  onRoleChange: (id: string, role: RetailSourceImageRole) => void
}

const ROLE_LABELS: Record<RetailSourceImageRole, string> = {
  product: '商品主体',
  back_label: '包装背标',
  gift_pack: '礼盒/外包装',
  authentic_document: '真实证照材料',
}

export default function SourceUploader({ images, roles, disabled, onFiles, onRemove, onRoleChange }: SourceUploaderProps) {
  const handleFiles = (list: FileList | null) => {
    if (!list) return
    onFiles([...list].filter((file) => file.type.startsWith('image/')))
  }

  return (
    <section className="retail-section" aria-labelledby="source-images-title">
      <div className="retail-section-heading">
        <div>
          <span className="retail-step-number">01</span>
          <h2 id="source-images-title">商品原图</h2>
        </div>
        <span className="retail-count">{images.length}/8</span>
      </div>

      <label
        className={`retail-dropzone ${disabled ? 'is-disabled' : ''}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          if (!disabled) handleFiles(event.dataTransfer.files)
        }}
      >
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={disabled || images.length >= 8}
          onChange={(event) => {
            handleFiles(event.target.files)
            event.currentTarget.value = ''
          }}
        />
        {images.length === 0 ? (
          <>
            <UploadCloud size={24} strokeWidth={1.8} />
            <strong>上传商品原图</strong>
            <span>PNG、JPG、WebP</span>
          </>
        ) : (
          <>
            <ImagePlus size={22} strokeWidth={1.8} />
            <strong>继续添加</strong>
          </>
        )}
      </label>

      {images.length > 0 && (
        <div className="retail-source-grid">
          {images.map((image, index) => (
            <div className="retail-source-item" key={image.id}>
              <div className="retail-source-thumb">
                <img src={image.dataUrl} alt={`参考图 ${index + 1}`} />
                <button
                  type="button"
                  title="移除图片"
                  aria-label="移除图片"
                  disabled={disabled}
                  onClick={() => onRemove(image.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <select
                aria-label={`参考图 ${index + 1} 角色`}
                value={roles[image.id] ?? 'product'}
                disabled={disabled}
                onChange={(event) => onRoleChange(image.id, event.target.value as RetailSourceImageRole)}
              >
                {Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
