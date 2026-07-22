import { useEffect, useMemo, useRef, useState } from 'react'
import type { StyleReferenceEditState } from '../types'
import { renderStyleReferenceDataUrl, sanitizeStyleReferenceEditState } from '../lib/styleReferences'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { CloseIcon } from './icons'
import { Sheet } from './Sheet'

const FIELD_CLASS = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500'
const LABEL_CLASS = 'mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400'
const EDIT_FIELD_LABELS = {
  typography: '字体方向',
  lighting: '光影方向',
  material: '材质方向',
} as const
export const STYLE_REFERENCE_TEXT_OPTIONS = {
  typography: [
    {
      value: 'Clean sans editorial',
      labelZh: '干净现代无衬线',
      descriptionZh: '适合科技、办公、工具类，文字感觉清爽、理性、易读。',
    },
    {
      value: 'Elegant high-contrast serif mix',
      labelZh: '高级对比衬线混排',
      descriptionZh: '适合精品、礼品、高客单产品，画面更有杂志感和高级感。',
    },
    {
      value: 'Rounded friendly retail type',
      labelZh: '圆润亲和零售字体',
      descriptionZh: '适合家居、快消、运动配件，整体更轻松、友好、货架感更强。',
    },
  ],
  lighting: [
    {
      value: 'Bright balanced studio light',
      labelZh: '明亮均衡棚拍光',
      descriptionZh: '适合大多数商品图，产品轮廓清楚、背景干净、信息区清晰。',
    },
    {
      value: 'Warm daylight and soft shadows',
      labelZh: '暖色自然光和柔和阴影',
      descriptionZh: '适合家居、母婴、户外生活类，氛围更自然温暖。',
    },
    {
      value: 'Focused contrast and premium highlights',
      labelZh: '聚焦对比和高级高光',
      descriptionZh: '适合金属、数码、精品配件，强调质感、层次和视觉焦点。',
    },
  ],
  material: [
    {
      value: 'Smooth product-grade surfaces',
      labelZh: '平滑商品级表面',
      descriptionZh: '适合通用电商质感，画面干净，材质不过度抢产品主体。',
    },
    {
      value: 'Glass, satin metal, crisp panels',
      labelZh: '玻璃、哑光金属、清晰面板',
      descriptionZh: '适合科技、工具、办公类，强调精密、冷静和结构感。',
    },
    {
      value: 'Glossy retail panels and color blocks',
      labelZh: '亮面零售面板和色块',
      descriptionZh: '适合快消、厨房、运动配件，信息区更醒目，促销页感更强。',
    },
  ],
} as const

interface StyleReferenceEditorModalProps {
  title: string
  initialState: StyleReferenceEditState
  saving?: boolean
  onClose: () => void
  onSave: (state: StyleReferenceEditState) => void
}

export default function StyleReferenceEditorModal({
  title,
  initialState,
  saving = false,
  onClose,
  onSave,
}: StyleReferenceEditorModalProps) {
  const [draft, setDraft] = useState<StyleReferenceEditState>(() => sanitizeStyleReferenceEditState(initialState))
  const [preview, setPreview] = useState('')
  const scrollBoundaryRef = useRef<HTMLDivElement>(null)
  const sanitizedDraft = useMemo(() => sanitizeStyleReferenceEditState(draft), [draft])

  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true, scrollBoundaryRef)

  useEffect(() => {
    setDraft(sanitizeStyleReferenceEditState(initialState))
  }, [initialState])

  useEffect(() => {
    try {
      setPreview(renderStyleReferenceDataUrl(sanitizedDraft))
    } catch {
      setPreview('')
    }
  }, [sanitizedDraft])

  const updatePalette = (index: number, color: string) => {
    setDraft((current) => ({
      ...current,
      palette: current.palette.map((item, itemIndex) => itemIndex === index ? color : item),
    }))
  }

  return (
    <Sheet
      onClose={onClose}
      rootClassName="z-[115]"
      className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden pt-5"
      labelledBy="style-editor-sheet-title"
    >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-white/[0.08]">
          <div className="min-w-0">
            <div id="style-editor-sheet-title" className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{title}</div>
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">保存后生成一张新的隐藏风格参考图。</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-100"
            aria-label="关闭风格编辑器"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div ref={scrollBoundaryRef} className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 lg:grid-cols-[1fr_360px] lg:gap-4">
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLASS}>名称</label>
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                className={FIELD_CLASS}
                maxLength={72}
              />
            </div>

            <div>
              <div className={LABEL_CLASS}>色板</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {draft.palette.map((color, index) => (
                  <label key={index} className="flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-white/[0.08] dark:bg-gray-900">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#FFFFFF'}
                      onChange={(event) => updatePalette(index, event.target.value)}
                      className="h-8 w-10 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                      aria-label={`颜色 ${index + 1}`}
                    />
                    <input
                      value={color}
                      onChange={(event) => updatePalette(index, event.target.value)}
                      className="min-w-0 flex-1 bg-transparent font-mono text-xs text-gray-700 outline-none dark:text-gray-200"
                      maxLength={7}
                    />
                  </label>
                ))}
              </div>
            </div>

            {(['typography', 'lighting', 'material'] as const).map((field) => (
              <div key={field}>
                <label className={LABEL_CLASS}>{EDIT_FIELD_LABELS[field]}</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {STYLE_REFERENCE_TEXT_OPTIONS[field].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, [field]: option.value }))}
                      className={`min-h-[104px] rounded-lg border px-3 py-2 text-left transition ${draft[field] === option.value ? 'border-blue-400 bg-blue-50 text-blue-800 ring-2 ring-blue-500/10 dark:border-blue-300/60 dark:bg-blue-400/10 dark:text-blue-100' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]'}`}
                    >
                      <span className="block text-xs font-semibold leading-snug">{option.value}</span>
                      <span className="mt-1 block text-xs font-semibold text-gray-800 dark:text-gray-100">{option.labelZh}</span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{option.descriptionZh}</span>
                    </button>
                  ))}
                </div>
                <input
                  value={draft[field]}
                  onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
                  className={`${FIELD_CLASS} mt-2`}
                  maxLength={80}
                />
                <div className="mt-1 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                  建议保留英文方向；上方中文说明只用于理解，不会写进右侧风格参考图。
                </div>
              </div>
            ))}

            <div>
              <div className={LABEL_CLASS}>信息密度</div>
              <div className="inline-flex h-10 rounded-lg border border-gray-200 bg-white p-0.5 text-sm font-semibold dark:border-white/[0.08] dark:bg-gray-900">
                {([
                  ['rich', '信息丰富'],
                  ['minimal', '简约'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDraft((current) => ({ ...current, density: value }))}
                    className={`rounded-md px-3 transition ${draft.density === value ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-950' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 lg:mt-0">
            <div className="sticky top-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-white/[0.08] dark:bg-white/[0.04]">
              {preview ? (
                <img src={preview} alt="风格参考预览" className="aspect-square w-full object-contain" />
              ) : (
                <div className="flex aspect-square items-center justify-center text-xs text-gray-400">无法生成预览</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onSave(sanitizedDraft)}
            disabled={saving}
            className={`inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold transition ${saving ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06] dark:text-gray-600' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
          >
            {saving ? '保存中...' : '保存风格'}
          </button>
        </div>
    </Sheet>
  )
}
