import { ImagePlus, Trash2, UploadCloud } from 'lucide-react'
import type { InputImage } from '../../types'

interface SourceUploaderProps {
  images: InputImage[]
  disabled?: boolean
  onFiles: (files: File[]) => void
  onRemove: (id: string) => void
}

export default function SourceUploader({ images, disabled, onFiles, onRemove }: SourceUploaderProps) {
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
            <div className="retail-source-thumb" key={image.id}>
              <img src={image.dataUrl} alt={`商品原图 ${index + 1}`} />
              {index === 0 && <span>主体图</span>}
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
          ))}
        </div>
      )}
    </section>
  )
}
