import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { addImageFromFile, ensureImageCached, submitTask, useStore } from '../store'
import { getAmazonPlannerProfile, isOfficialDeepSeekPlannerProfile, validateApiProfile } from '../lib/apiProfiles'
import {
  DEFAULT_AMAZON_PROMPT_DRAFT,
  type AmazonPromptDraft,
} from '../lib/amazonPrompt'
import {
  A_PLUS_CONTENT_TYPES,
  buildAmazonAPlusPlanPrompt,
  buildAmazonPlanPrompt,
  DEFAULT_LISTING_IMAGE_COUNT,
  formatAmazonListingSlotRange,
  formatAPlusModuleText,
  areAPlusModuleSpecsEquivalent,
  insertAPlusModuleSpecAfter,
  LISTING_IMAGE_COUNT_OPTIONS,
  MAX_A_PLUS_MODULE_COUNT,
  MIN_A_PLUS_MODULE_COUNT,
  getAPlusContentTypeLabel,
  getAPlusModuleDisplayName,
  getAPlusModuleEnglishName,
  getAPlusModuleGenerationSize,
  getAPlusModuleSpecs,
  getAPlusModuleUploadSize,
  isAmazonListingMainSlot,
  isAPlusTextModule,
  normalizeAPlusModuleSpecs,
  normalizeListingImageCount,
  removeAPlusModuleSpecAt,
  withAPlusGenerationSizes,
  type APlusContentType,
  type AmazonAPlusModuleSpec,
  type AmazonAPlusPlan,
  type AmazonImagePlan,
  type AmazonPlannerMode,
  type AmazonStyleDensityMode,
} from '../lib/listingPlanner'
import { callAmazonPlannerApi, type PlannerApiResult } from '../lib/listingPlannerApi'
import { deleteAmazonPlannerSession, getAllAmazonPlannerSessions, putAmazonPlannerSession } from '../lib/db'
import { prepareReferenceImagePayload, type PlannerReferenceImagePayload } from '../lib/referenceImagePayload'
import {
  DEFAULT_STYLE_PRESET_ID,
  STYLE_PRESETS,
  ensureStylePresetImageStored,
  getStylePresetAssetUrl,
  getStylePresetById,
  type StylePreset,
} from '../lib/stylePresets'
import {
  createStyleReferenceEditStateFromPreset,
  ensureCustomStyleReferenceImageStored,
  getCustomStyleReferenceDescription,
  getCustomStyleReferenceVisualMeta,
  renderStyleReferenceDataUrl,
  sanitizeStyleReferenceEditState,
} from '../lib/styleReferences'
import { DEFAULT_PARAMS } from '../types'
import type { AmazonPlannerSession, CustomStyleReference, StyleReferenceEditState } from '../types'
import StyleReferenceEditorModal from './StyleReferenceEditorModal'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, CopyIcon, EditIcon, EyeIcon, HistoryIcon, PhotoIcon, PlusIcon, RefreshIcon, TrashIcon } from './icons'

const FIELD_CLASS = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500'
const LABEL_CLASS = 'mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400'
const PLAN_LIST_CLASS = 'grid max-h-[420px] gap-2 overflow-y-auto overscroll-contain pr-1 custom-scrollbar sm:max-h-[480px]'
const GUIDE_HINT_CLASS = 'mb-3 rounded-lg border border-blue-200 bg-white/85 px-3 py-2 text-xs font-medium leading-relaxed text-blue-800 shadow-sm dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-100'
const DEEPSEEK_PLANNER_NOTICE = '当前 AI 策划配置为 DeepSeek 官方接口。DeepSeek 策划阶段不会读取参考图，系统会仅用 Listing 文本和你填写的商品信息生成策划；参考图仍会在正式生图时随生图请求发送。请把产品颜色、形状、结构、配件、Logo、套装数量等关键特征写进 Listing 或商品信息中。'
const API_MAX_IMAGES = 16
const STYLE_PREVIEW_WIDTH = 420
const STYLE_PREVIEW_HEIGHT = 500
const STYLE_PREVIEW_OFFSET = 16
const STYLE_DENSITY_OPTIONS: Array<{ value: AmazonStyleDensityMode; label: string }> = [
  { value: 'rich', label: '信息丰富' },
  { value: 'minimal', label: '简约' },
]
type ComplianceStatus = 'ready' | 'warning' | 'missing'
type WorkflowStepStatus = 'done' | 'current' | 'todo'
type PlannerGuideTarget = 'planner-api' | 'planner-input' | 'planner-action' | 'style' | 'style-choice' | 'plan-list' | 'action-bar'
type PlannerGuideState = {
  target: PlannerGuideTarget
  message: string
}
type GuidePanelTone = 'white' | 'muted'
type PlannerActionProgress = 'filled' | 'submitted'
type PlannerActionProgressMap = Record<string, PlannerActionProgress>
type MobileActionDock = 'left' | 'right' | null
type APlusModuleSpecsByType = Partial<Record<APlusContentType, AmazonAPlusModuleSpec[]>>
type SelectedStyleReference = {
  presetId: string | null
  customStyleReferenceId: string | null
  imageId: string
  dataUrl: string
  label: string
  description: string
  palette: string[]
}
type StylePreviewState = {
  dataUrl: string
  label: string
  description: string
  left: number
  top: number
}
const PLANNER_HISTORY_LIMIT = 30

function createPlannerSessionId() {
  return `amazon-planner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createCustomStyleReferenceId() {
  return `custom-style-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeHistoryTitle(value: string) {
  const chars = Array.from(value.replace(/\s+/g, ' ').trim())
  if (chars.length <= 40) return chars.join('')
  return `${chars.slice(0, 37).join('')}...`
}

function getPlannerSessionTitle(draft: AmazonPromptDraft, listingText: string) {
  return normalizeHistoryTitle(draft.productTitle) || normalizeHistoryTitle(listingText) || '未命名策划'
}

function getSessionListingImageCount(session: AmazonPlannerSession) {
  if (session.listingImageCount != null) return normalizeListingImageCount(session.listingImageCount)
  return normalizeListingImageCount(session.imagePlans.length || DEFAULT_LISTING_IMAGE_COUNT)
}

function getSessionAPlusModuleSpecsByType(session: AmazonPlannerSession): APlusModuleSpecsByType {
  const sessionSpecs = session.aPlusModuleSpecs ?? {}
  return A_PLUS_CONTENT_TYPES.reduce<APlusModuleSpecsByType>((result, type) => {
    const specs = sessionSpecs[type]
    if (Array.isArray(specs) && specs.length) {
      const normalizedSpecs = normalizeAPlusModuleSpecs(type, specs as Array<Partial<AmazonAPlusModuleSpec>>)
      if (!areAPlusModuleSpecsEquivalent(normalizedSpecs, getAPlusModuleSpecs(type))) {
        result[type] = normalizedSpecs
      }
    }
    return result
  }, {})
}

function getAPlusModuleSpecsForSession(
  specsByType: APlusModuleSpecsByType,
): AmazonPlannerSession['aPlusModuleSpecs'] {
  const entries = A_PLUS_CONTENT_TYPES
    .map((type) => {
      const specs = specsByType[type]
      if (!specs?.length || areAPlusModuleSpecsEquivalent(specs, getAPlusModuleSpecs(type))) return null
      return [type, specs] as const
    })
    .filter((entry): entry is readonly [APlusContentType, AmazonAPlusModuleSpec[]] => Boolean(entry))

  return entries.length ? Object.fromEntries(entries) : undefined
}

function formatPlannerSessionTime(value: number) {
  if (!Number.isFinite(value)) return ''
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toSessionDraft(draft: AmazonPromptDraft): AmazonPlannerSession['draft'] {
  return {
    kind: draft.kind,
    productTitle: draft.productTitle,
    category: draft.category,
    brand: draft.brand,
    color: draft.color,
    material: draft.material,
    audience: draft.audience,
    sellingPoints: draft.sellingPoints,
    packageIncludes: draft.packageIncludes,
    scene: draft.scene,
    forbidden: draft.forbidden,
  }
}

function fromSessionDraft(draft: AmazonPlannerSession['draft']): AmazonPromptDraft {
  return {
    ...DEFAULT_AMAZON_PROMPT_DRAFT,
    ...draft,
    kind: (draft.kind as AmazonPromptDraft['kind']) || DEFAULT_AMAZON_PROMPT_DRAFT.kind,
  }
}

function sortPlannerSessions(sessions: AmazonPlannerSession[]) {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, PLANNER_HISTORY_LIMIT)
}

function getActionStepClass(status: WorkflowStepStatus) {
  if (status === 'done') return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200'
  if (status === 'current') return 'border-blue-200 bg-blue-50 text-blue-800 ring-1 ring-blue-500/10 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200'
  return 'border-gray-200 bg-white text-gray-500 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-400'
}

function getGuidePanelClass(isActive: boolean, tone: GuidePanelTone = 'white') {
  if (isActive) return 'border-blue-300 bg-blue-50/60 ring-2 ring-blue-500/15 dark:border-blue-400/60 dark:bg-blue-500/10'
  if (tone === 'muted') return 'border-gray-200 bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950'
  return 'border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-950'
}

function getGuideFocusClass(isActive: boolean) {
  return isActive ? 'ring-2 ring-blue-500/20 dark:ring-blue-400/20' : ''
}

function getPlannerActionKey(mode: AmazonPlannerMode, planIndex: number | null, slot: string | undefined | null) {
  if (planIndex == null || !slot) return ''
  return `${mode}:${planIndex}:${slot}`
}

function getPlannerFailureDetail(err: unknown): string {
  const rawMessage = err instanceof Error ? err.message : String(err)
  const message = rawMessage.trim() || '未知错误'
  const lower = message.toLowerCase()
  const hints: string[] = []

  if (/401|invalid api key|incorrect api key|unauthorized|forbidden|权限|认证|鉴权/.test(lower)) {
    hints.push('请检查 AI 策划配置里的 API Key 是否正确，并确认该 Key 有所选聊天/策划接口权限。')
  }
  if (/404|not found|responses|endpoint|route|路径|不存在/.test(lower)) {
    hints.push('请确认 AI 策划配置的 API URL 支持当前接口：DeepSeek 请使用 Chat Completions（/chat/completions），不要使用只开放 /v1/images 的图片中转。')
  }
  if (/model|does not exist|unsupported|not supported|模型/.test(lower)) {
    hints.push('请确认 AI 策划配置使用的是文本/多模态模型，而不是 gpt-image-2。')
  }
  if (/json_schema|schema|structured|text\.format|response_format|strict/.test(lower)) {
    hints.push('该接口可能不支持当前 JSON 输出参数；Chat Completions 需要支持 response_format=json_object。')
  }
  if (/failed to fetch|network|cors|load failed|连接|网络|跨域/.test(lower)) {
    hints.push('浏览器未能连接到策划接口；请检查网络、跨域设置，或开启应用里的 API 代理。')
  }

  return [message, ...hints].join('\n\n')
}

function updateDraft<K extends keyof AmazonPromptDraft>(
  draft: AmazonPromptDraft,
  key: K,
  value: AmazonPromptDraft[K],
) {
  return { ...draft, [key]: value }
}

function isAbortError(err: unknown): boolean {
  return (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
}

function getStylePreviewPosition(clientX: number, clientY: number) {
  if (typeof window === 'undefined') {
    return { left: clientX + STYLE_PREVIEW_OFFSET, top: clientY + STYLE_PREVIEW_OFFSET }
  }
  const viewportPadding = 12
  const rightLeft = clientX + STYLE_PREVIEW_OFFSET
  const left = rightLeft + STYLE_PREVIEW_WIDTH <= window.innerWidth - viewportPadding
    ? rightLeft
    : Math.max(viewportPadding, clientX - STYLE_PREVIEW_WIDTH - STYLE_PREVIEW_OFFSET)
  const maxTop = Math.max(viewportPadding, window.innerHeight - STYLE_PREVIEW_HEIGHT - viewportPadding)
  const top = Math.min(Math.max(viewportPadding, clientY - 160), maxTop)
  return { left, top }
}

function getPlanSummary(planMarkdown: string) {
  const lines = planMarkdown
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, '').replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean)
  return lines[0] ?? ''
}

function getAmazonAPlusComplianceChecks(
  draft: AmazonPromptDraft,
  plan: AmazonAPlusPlan | null,
  aPlusType: APlusContentType,
  referenceImageCount: number,
  hasStyleReference: boolean,
): Array<{ label: string; status: ComplianceStatus; detail: string }> {
  return [
    {
      label: '商品名称',
      status: draft.productTitle.trim() ? 'ready' : 'missing',
      detail: draft.productTitle.trim() ? '已填写' : '需要填写准确商品名',
    },
    {
      label: 'A+ 类型',
      status: 'ready',
      detail: `${getAPlusContentTypeLabel(aPlusType)} A+ 编排`,
    },
    {
      label: 'A+ 尺寸',
      status: plan ? 'ready' : 'warning',
      detail: plan ? `${plan.generationSize} 生成，上传建议 ${plan.uploadSize}` : '请选择一个 A+ 模块',
    },
    {
      label: '参考图',
      status: referenceImageCount > 0 ? 'ready' : 'warning',
      detail: referenceImageCount > 0 ? `${referenceImageCount} 张参考图` : '建议上传产品实拍参考图',
    },
    {
      label: '风格参考',
      status: hasStyleReference ? 'ready' : 'warning',
      detail: hasStyleReference ? '已选择隐藏风格参考' : '正式生成前请选择风格参考',
    },
  ]
}

function getAmazonListingPlannerChecks(
  draft: AmazonPromptDraft,
  size: string,
  referenceImageCount: number,
  hasStyleReference: boolean,
  styleReferenceRequired: boolean,
): Array<{ label: string; status: ComplianceStatus; detail: string }> {
  return [
    {
      label: '商品名称',
      status: draft.productTitle.trim() ? 'ready' : 'missing',
      detail: draft.productTitle.trim() ? '已填写' : '等待 AI 从 Listing 解析',
    },
    {
      label: '图片规格',
      status: /^(2048|4096)x(2048|4096)$/.test(size) ? 'ready' : 'warning',
      detail: /4096x4096/.test(size) ? '4K 方图' : /2048x2048/.test(size) ? '2K 方图' : size || '未选择 2K/4K',
    },
    {
      label: '参考图',
      status: referenceImageCount > 0 ? 'ready' : 'warning',
      detail: referenceImageCount > 0 ? `${referenceImageCount} 张产品参考图` : '建议上传产品实拍参考图',
    },
    {
      label: '风格参考',
      status: !styleReferenceRequired || hasStyleReference ? 'ready' : 'warning',
      detail: !styleReferenceRequired
        ? 'MAIN 主图不使用隐藏风格参考'
        : hasStyleReference ? '已选择隐藏风格参考' : '正式生成前请选择风格参考',
    },
  ]
}

export default function AmazonPlanner() {
  const prompt = useStore((s) => s.prompt)
  const inputImages = useStore((s) => s.inputImages)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const setPrompt = useStore((s) => s.setPrompt)
  const setParams = useStore((s) => s.setParams)
  const setPendingTaskCategory = useStore((s) => s.setPendingTaskCategory)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const removeInputImage = useStore((s) => s.removeInputImage)
  const clearInputImages = useStore((s) => s.clearInputImages)
  const setInputImages = useStore((s) => s.setInputImages)
  const setLightboxImageId = useStore((s) => s.setLightboxImageId)
  const showToast = useStore((s) => s.showToast)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const plannerAbortControllerRef = useRef<AbortController | null>(null)
  const stylePresetAbortControllerRef = useRef<AbortController | null>(null)
  const [draft, setDraft] = useState<AmazonPromptDraft>(DEFAULT_AMAZON_PROMPT_DRAFT)
  const [resolution, setResolution] = useState<'2k' | '4k'>('2k')
  const [listingImageCount, setListingImageCount] = useState(DEFAULT_LISTING_IMAGE_COUNT)
  const [plannerMode, setPlannerMode] = useState<AmazonPlannerMode>('listing')
  const [aPlusType, setAPlusType] = useState<APlusContentType>('standard-large')
  const [aPlusModuleSpecsByType, setAPlusModuleSpecsByType] = useState<APlusModuleSpecsByType>({})
  const [listingText, setListingText] = useState('')
  const [imagePlans, setImagePlans] = useState<AmazonImagePlan[]>([])
  const [aPlusPlans, setAPlusPlans] = useState<AmazonAPlusPlan[]>([])
  const [seriesStyleGuides, setSeriesStyleGuides] = useState<{ listing: string; aplus: string }>({
    listing: '',
    aplus: '',
  })
  const [selectedStylePresetId, setSelectedStylePresetId] = useState<string | null>(DEFAULT_STYLE_PRESET_ID)
  const [selectedStyleReference, setSelectedStyleReference] = useState<SelectedStyleReference | null>(null)
  const [styleDensityMode, setStyleDensityMode] = useState<AmazonStyleDensityMode>('rich')
  const [stylePreview, setStylePreview] = useState<StylePreviewState | null>(null)
  const [isLoadingStylePreset, setIsLoadingStylePreset] = useState(false)
  const [styleError, setStyleError] = useState('')
  const [customStyleImageDataUrls, setCustomStyleImageDataUrls] = useState<Record<string, string>>({})
  const [styleEditor, setStyleEditor] = useState<{
    mode: 'preset' | 'custom'
    title: string
    basePresetId: string | null
    customStyleId: string | null
    initialState: StyleReferenceEditState
  } | null>(null)
  const [isSavingStyleEditor, setIsSavingStyleEditor] = useState(false)
  const [selectedPlanIndex, setSelectedPlanIndex] = useState<number | null>(null)
  const [selectedAPlusPlanIndex, setSelectedAPlusPlanIndex] = useState<number | null>(null)
  const [plannerSessions, setPlannerSessions] = useState<AmazonPlannerSession[]>([])
  const [currentPlannerSessionId, setCurrentPlannerSessionId] = useState<string | null>(null)
  const [showPlannerHistory, setShowPlannerHistory] = useState(false)
  const [isPlanning, setIsPlanning] = useState(false)
  const [plannerError, setPlannerError] = useState('')
  const [isPreparingReferencePayload, setIsPreparingReferencePayload] = useState(false)
  const [referencePayloadNotice, setReferencePayloadNotice] = useState('')
  const [actionProgress, setActionProgress] = useState<PlannerActionProgressMap>({})
  const [mobileActionDock, setMobileActionDock] = useState<MobileActionDock>(null)
  const resolutionTier = resolution === '4k' ? '4K' : '2K'
  const listingSlotRange = formatAmazonListingSlotRange(listingImageCount)
  const aPlusSpecs = useMemo(
    () => normalizeAPlusModuleSpecs(aPlusType, aPlusModuleSpecsByType[aPlusType]),
    [aPlusModuleSpecsByType, aPlusType],
  )
  const aPlusDefaultSpecs = useMemo(() => getAPlusModuleSpecs(aPlusType), [aPlusType])
  const aPlusSpecsAreDefault = areAPlusModuleSpecsEquivalent(aPlusSpecs, aPlusDefaultSpecs)
  const aPlusPlansWithSizes = useMemo(() => withAPlusGenerationSizes(aPlusPlans, resolutionTier), [aPlusPlans, resolutionTier])
  const selectedPlan = selectedPlanIndex == null ? null : imagePlans[selectedPlanIndex] ?? null
  const selectedAPlusPlan = selectedAPlusPlanIndex == null ? null : aPlusPlansWithSizes[selectedAPlusPlanIndex] ?? null
  const selectedAPlusText = selectedAPlusPlan ? formatAPlusModuleText(selectedAPlusPlan) : ''
  const customStyleReferences = settings.customStyleReferences ?? []
  const selectedStylePreset = getStylePresetById(selectedStylePresetId)
  const selectedStyleImage = selectedStyleReference
  const selectedStyleLabel = selectedStyleReference?.label ?? selectedStylePreset?.label ?? ''
  const selectedVisualStyle = selectedStyleReference
    ? {
        label: selectedStyleReference.label,
        description: selectedStyleReference.description,
        palette: selectedStyleReference.palette,
      }
    : selectedStylePreset
  const activeSeriesStyleGuide = plannerMode === 'aplus' ? seriesStyleGuides.aplus : seriesStyleGuides.listing
  const isMainListingPlan = plannerMode === 'listing' && isAmazonListingMainSlot(selectedPlan?.slot)
  const styleReferenceRequired = !isMainListingPlan
  const hasStyleReference = Boolean(selectedStyleImage?.imageId)
  const usesStyleReferenceForActivePlan = styleReferenceRequired && hasStyleReference
  const effectiveReferenceCount = inputImages.length + (usesStyleReferenceForActivePlan && selectedStyleImage?.imageId && !inputImages.some((image) => image.id === selectedStyleImage.imageId) ? 1 : 0)
  const styleReferenceLimitExceeded = usesStyleReferenceForActivePlan && effectiveReferenceCount > API_MAX_IMAGES
  const activePrompt = plannerMode === 'aplus'
    ? selectedAPlusPlan ? buildAmazonAPlusPlanPrompt({
      ...selectedAPlusPlan,
      seriesStyleGuide: activeSeriesStyleGuide,
      styleReferenceAttached: usesStyleReferenceForActivePlan,
      styleDensityMode,
      selectedVisualStyle: usesStyleReferenceForActivePlan ? selectedVisualStyle : null,
    }) : ''
    : selectedPlan ? buildAmazonPlanPrompt({
      ...selectedPlan,
      seriesStyleGuide: isMainListingPlan ? null : activeSeriesStyleGuide,
      styleReferenceAttached: usesStyleReferenceForActivePlan,
      styleDensityMode,
      selectedVisualStyle: usesStyleReferenceForActivePlan ? selectedVisualStyle : null,
    }) : ''
  const activePlanMarkdown = plannerMode === 'aplus' ? selectedAPlusPlan?.planMarkdown ?? '' : selectedPlan?.planMarkdown ?? ''
  const activePlanPreview = activePlanMarkdown
    ? [
        activePlanMarkdown,
        '',
        '英文生图提示词 Prompt',
        activePrompt,
      ].join('\n')
    : activePrompt
  const plannerProfile = getAmazonPlannerProfile(settings)
  const plannerProfileValidation = plannerProfile ? validateApiProfile(plannerProfile) : '未选择支持 Chat Completions 或 Responses API 的 AI 策划配置'
  const plannerApiLabel = plannerProfile?.apiMode === 'chat' ? 'Chat Completions' : 'Responses API'
  const plannerUsesOfficialDeepSeek = plannerProfile ? isOfficialDeepSeekPlannerProfile(plannerProfile) : false
  const listingTargetSize = resolution === '4k' ? '4096x4096' : '2048x2048'
  const targetSize = plannerMode === 'aplus' && selectedAPlusPlan ? selectedAPlusPlan.generationSize : listingTargetSize
  const generationParamLabel = `${DEFAULT_PARAMS.output_format.toUpperCase()} / ${DEFAULT_PARAMS.quality} / 压缩率${DEFAULT_PARAMS.output_compression}`
  const visiblePlanCount = plannerMode === 'aplus' ? aPlusPlansWithSizes.length : imagePlans.length
  const visiblePlanIndex = plannerMode === 'aplus' ? selectedAPlusPlanIndex : selectedPlanIndex
  const actionSlot = plannerMode === 'aplus' ? selectedAPlusPlan?.slot : selectedPlan?.slot
  const actionLabel = plannerMode === 'aplus' ? selectedAPlusPlan?.label : selectedPlan?.label
  const showStickyActions = plannerMode === 'aplus' ? aPlusPlansWithSizes.length > 0 : imagePlans.length > 0
  const actionDisabled = plannerMode === 'aplus' ? !selectedAPlusPlan : !activePrompt.trim()
  const submitDisabled = actionDisabled || (styleReferenceRequired && !hasStyleReference) || styleReferenceLimitExceeded
  const hasPlanOptions = visiblePlanCount > 0
  const hasSelectedPlan = plannerMode === 'aplus' ? Boolean(selectedAPlusPlan) : Boolean(selectedPlan)
  const canGoPrev = visiblePlanCount > 0 && visiblePlanIndex != null && visiblePlanIndex > 0
  const canGoNext = visiblePlanCount > 0 && visiblePlanIndex != null && visiblePlanIndex < visiblePlanCount - 1
  const actionPositionLabel = visiblePlanCount > 0 && visiblePlanIndex != null
    ? `${visiblePlanIndex + 1}/${visiblePlanCount}`
    : plannerMode === 'aplus'
      ? `${aPlusSpecs.length} 个待策划模块`
      : '未选择'
  const currentActionKey = getPlannerActionKey(plannerMode, visiblePlanIndex, actionSlot)
  const currentActionProgress = currentActionKey ? actionProgress[currentActionKey] ?? null : null
  const currentActionFilled = currentActionProgress === 'filled' || currentActionProgress === 'submitted'
  const currentActionSubmitted = currentActionProgress === 'submitted'
  const actionKindLabel = plannerMode === 'aplus' ? '模块' : isMainListingPlan ? '主图' : '图片'
  const actionGuidance = !hasSelectedPlan
    ? plannerMode === 'aplus' ? '先选择一个 A+ 模块' : '先选择一个图片位'
    : currentActionSubmitted
      ? `已提交 ${actionSlot ?? '当前'} ${actionKindLabel}，${canGoNext ? '点击下一张继续' : '已是最后一张'}`
      : currentActionFilled
        ? '已填入右侧输入框，下一步提交生成'
        : `先填入当前 ${actionSlot ?? '当前'} ${actionKindLabel}提示词`
  const mainStyleGuidance = isMainListingPlan
    ? hasStyleReference
      ? 'MAIN 主图不附加风格参考图；附图和 A+ 会使用已选风格。'
      : 'MAIN 主图不附加风格参考图；附图和 A+ 可选择风格参考。'
    : ''
  const actionProgressSteps = [
    {
      label: '1 填入',
      detail: currentActionFilled ? '已填入' : '待填入',
      status: currentActionFilled ? 'done' : 'current',
    },
    {
      label: '2 提交生成',
      detail: currentActionSubmitted ? '已提交' : currentActionFilled ? '下一步' : '待提交',
      status: currentActionSubmitted ? 'done' : currentActionFilled ? 'current' : 'todo',
    },
    {
      label: '3 下一张',
      detail: currentActionSubmitted ? (canGoNext ? '继续下一张' : '最后一张') : '提交后继续',
      status: currentActionSubmitted ? (canGoNext ? 'current' : 'done') : 'todo',
    },
  ] satisfies Array<{ label: string; detail: string; status: WorkflowStepStatus }>
  const hasListingText = Boolean(listingText.trim())
  const hasUsablePlannerProfile = Boolean(plannerProfile && !plannerProfileValidation)
  const seriesStyleReferenceNeeded = plannerMode === 'aplus'
    ? hasPlanOptions
    : imagePlans.some((plan) => !isAmazonListingMainSlot(plan.slot))
  const guideState: PlannerGuideState = !hasUsablePlannerProfile
    ? {
        target: 'planner-api',
        message: plannerProfileValidation ? `下一步：先配置 AI 策划 API（${plannerProfileValidation}）` : '下一步：先配置 AI 策划 API',
      }
    : !hasListingText
      ? {
          target: 'planner-input',
          message: plannerMode === 'aplus' ? '下一步：粘贴标题、五点描述或品牌说明' : '下一步：粘贴标题和五点描述',
        }
      : !hasPlanOptions
        ? {
            target: 'planner-action',
            message: plannerMode === 'aplus' ? '下一步：点击 AI策划A+ 生成模块方案' : '下一步：点击 AI策划生成逐张方案',
          }
        : seriesStyleReferenceNeeded && !hasStyleReference
          ? {
              target: 'style-choice',
              message: isLoadingStylePreset
                ? '正在加载风格参考图'
                : '下一步：选择一套风格参考，统一附图和 A+ 视觉',
            }
          : !hasSelectedPlan
            ? {
                target: 'plan-list',
                message: plannerMode === 'aplus' ? '下一步：选择要生成的 A+ 模块' : '下一步：选择要生成的图片位',
              }
            : {
                target: 'action-bar',
                message: currentActionSubmitted
                  ? canGoNext ? '下一步：点击下一张继续处理' : '当前图片已提交，已是最后一张'
                  : currentActionFilled
                    ? '下一步：提交生成当前图片'
                    : `下一步：填入当前 ${actionSlot ?? '当前'} ${actionKindLabel}提示词`,
              }
  const plannerGuideActive = guideState.target === 'planner-api' || guideState.target === 'planner-input' || guideState.target === 'planner-action'
  const styleGuideActive = guideState.target === 'style' || guideState.target === 'style-choice'
  const planListGuideActive = guideState.target === 'plan-list'
  const actionBarGuideActive = guideState.target === 'action-bar'
  const checks = plannerMode === 'aplus'
    ? getAmazonAPlusComplianceChecks(draft, selectedAPlusPlan, aPlusType, inputImages.length, hasStyleReference)
    : getAmazonListingPlannerChecks(draft, targetSize, inputImages.length, hasStyleReference, styleReferenceRequired)
  const atImageLimit = inputImages.length >= API_MAX_IMAGES

  useEffect(() => {
    let cancelled = false
    getAllAmazonPlannerSessions()
      .then((sessions) => {
        if (!cancelled) setPlannerSessions(sortPlannerSessions(sessions))
      })
      .catch((err) => {
        if (!cancelled) showToast(`策划历史加载失败：${err instanceof Error ? err.message : String(err)}`, 'error')
      })
    return () => {
      cancelled = true
    }
  }, [showToast])

  useEffect(() => {
    return () => {
      plannerAbortControllerRef.current?.abort()
      plannerAbortControllerRef.current = null
      stylePresetAbortControllerRef.current?.abort()
      stylePresetAbortControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    setReferencePayloadNotice('')
  }, [inputImages])

  useEffect(() => {
    if (!showStickyActions && mobileActionDock) setMobileActionDock(null)
  }, [mobileActionDock, showStickyActions])

  useEffect(() => {
    let cancelled = false
    Promise.all(customStyleReferences.map(async (style) => {
      const cached = style.imageId ? await ensureImageCached(style.imageId) : ''
      if (cached) return [style.id, cached] as const
      try {
        return [style.id, renderStyleReferenceDataUrl(style.editState)] as const
      } catch {
        return [style.id, ''] as const
      }
    }))
      .then((entries) => {
        if (cancelled) return
        setCustomStyleImageDataUrls(Object.fromEntries(entries.filter(([, dataUrl]) => Boolean(dataUrl))))
      })
      .catch(() => {
        if (!cancelled) setCustomStyleImageDataUrls({})
      })
    return () => {
      cancelled = true
    }
  }, [customStyleReferences])

  const upsertPlannerSessionList = (session: AmazonPlannerSession) => {
    setPlannerSessions((current) => sortPlannerSessions([
      session,
      ...current.filter((item) => item.id !== session.id),
    ]))
  }

  const createPlannerSessionSnapshot = (overrides: Partial<AmazonPlannerSession> = {}): AmazonPlannerSession => {
    const now = Date.now()
    const targetSessionId = overrides.id ?? currentPlannerSessionId
    const existing = targetSessionId ? plannerSessions.find((session) => session.id === targetSessionId) : null
    const snapshotDraft = overrides.draft ? fromSessionDraft(overrides.draft) : draft
    const snapshotListingText = overrides.listingText ?? listingText
    const hasOverride = (key: keyof AmazonPlannerSession) => Object.prototype.hasOwnProperty.call(overrides, key)
    return {
      id: targetSessionId ?? createPlannerSessionId(),
      title: overrides.title ?? getPlannerSessionTitle(snapshotDraft, snapshotListingText),
      mode: overrides.mode ?? plannerMode,
      aPlusType: overrides.aPlusType ?? aPlusType,
      resolution: overrides.resolution ?? resolution,
      listingImageCount: overrides.listingImageCount ?? listingImageCount,
      aPlusModuleSpecs: hasOverride('aPlusModuleSpecs')
        ? overrides.aPlusModuleSpecs
        : getAPlusModuleSpecsForSession(aPlusModuleSpecsByType),
      listingText: snapshotListingText,
      referenceImageIds: overrides.referenceImageIds ?? inputImages.map((image) => image.id),
      draft: overrides.draft ?? toSessionDraft(draft),
      seriesStyleGuides: overrides.seriesStyleGuides ?? seriesStyleGuides,
      styleCandidates: overrides.styleCandidates ?? [],
      styleImages: overrides.styleImages ?? [],
      selectedStyleIndex: overrides.selectedStyleIndex ?? null,
      selectedStylePresetId: hasOverride('selectedStylePresetId') ? overrides.selectedStylePresetId : selectedStylePresetId,
      selectedStyleReferenceImageId: hasOverride('selectedStyleReferenceImageId') ? overrides.selectedStyleReferenceImageId : selectedStyleReference?.imageId ?? null,
      selectedCustomStyleReferenceId: hasOverride('selectedCustomStyleReferenceId') ? overrides.selectedCustomStyleReferenceId : selectedStyleReference?.customStyleReferenceId ?? null,
      selectedCustomStyleReferenceSnapshot: hasOverride('selectedCustomStyleReferenceSnapshot') ? overrides.selectedCustomStyleReferenceSnapshot : (
        selectedStyleReference?.customStyleReferenceId
          ? customStyleReferences.find((style) => style.id === selectedStyleReference.customStyleReferenceId) ?? null
          : null
      ),
      styleDensityMode: overrides.styleDensityMode ?? styleDensityMode,
      imagePlans: overrides.imagePlans ?? imagePlans,
      aPlusPlans: overrides.aPlusPlans ?? aPlusPlansWithSizes,
      selectedPlanIndex: hasOverride('selectedPlanIndex') ? overrides.selectedPlanIndex ?? null : selectedPlanIndex,
      selectedAPlusPlanIndex: hasOverride('selectedAPlusPlanIndex') ? overrides.selectedAPlusPlanIndex ?? null : selectedAPlusPlanIndex,
      createdAt: overrides.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
    }
  }

  const savePlannerSession = async (overrides: Partial<AmazonPlannerSession> = {}) => {
    const session = createPlannerSessionSnapshot(overrides)
    await putAmazonPlannerSession(session)
    setCurrentPlannerSessionId(session.id)
    upsertPlannerSessionList(session)
    return session
  }

  const updateCurrentPlannerSession = (overrides: Partial<AmazonPlannerSession>) => {
    if (!currentPlannerSessionId) return
    void savePlannerSession(overrides).catch((err) => {
      showToast(`策划历史保存失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    })
  }

  const markActionProgress = (key: string, progress: PlannerActionProgress) => {
    if (!key) return
    setActionProgress((current) => ({
      ...current,
      [key]: progress,
    }))
  }

  const applyPrompt = (options: { requireStyle?: boolean } = {}) => {
    if (plannerMode === 'aplus' && !selectedAPlusPlan) {
      showToast('请先 AI 策划并选择一个 A+ 模块', 'error')
      return false
    }
    if (!activePrompt.trim()) {
      showToast(plannerMode === 'aplus' ? '请先 AI 策划并选择一个 A+ 模块' : '请先 AI 策划并选择一个图片位', 'error')
      return false
    }
    const shouldRequireStyle = options.requireStyle && styleReferenceRequired
    if (shouldRequireStyle && !selectedStyleImage?.imageId) {
      showToast('请先选择一套风格参考', 'error')
      return false
    }
    if (shouldRequireStyle && styleReferenceLimitExceeded) {
      showToast(`已选择隐藏风格参考板，实际参考图数量不能超过 ${API_MAX_IMAGES} 张；请删除一张产品参考图后再提交。`, 'error')
      return false
    }

    setPrompt(activePrompt)
    setPendingTaskCategory({
      mode: 'prompt-match',
      prompt: activePrompt,
      category: {
        productTitle: draft.productTitle.trim(),
        workflow: plannerMode === 'aplus' ? 'amazon-aplus' : 'amazon-listing',
        amazonSlot: plannerMode === 'aplus' ? selectedAPlusPlan?.slot : selectedPlan?.slot,
        ...(plannerMode === 'aplus' ? { aPlusType } : {}),
        ...(usesStyleReferenceForActivePlan && selectedStyleImage?.imageId ? { styleReferenceImageId: selectedStyleImage.imageId } : {}),
      },
    })
    setParams({
      size: targetSize,
      quality: DEFAULT_PARAMS.quality,
      output_format: DEFAULT_PARAMS.output_format,
      output_compression: DEFAULT_PARAMS.output_compression,
      n: 1,
    })
    markActionProgress(currentActionKey, 'filled')
    showToast(plannerMode === 'aplus' ? '已填入 A+ 图片提示词' : '已填入亚马逊图片提示词', 'success')
    return true
  }

  const applyAndSubmit = () => {
    if (!applyPrompt({ requireStyle: true })) return
    const submittedActionKey = currentActionKey
    queueMicrotask(() => {
      void submitTask().then((submitted) => {
        if (submitted) markActionProgress(submittedActionKey, 'submitted')
      })
    })
  }

  const copyPrompt = async () => {
    if (plannerMode === 'aplus' && !selectedAPlusPlan) {
      showToast('请先 AI 策划并选择一个 A+ 模块', 'error')
      return
    }
    if (!activePrompt.trim()) {
      showToast(plannerMode === 'aplus' ? '请先 AI 策划并选择一个 A+ 模块' : '请先 AI 策划并选择一个图片位', 'error')
      return
    }

    try {
      await navigator.clipboard.writeText(activePrompt)
      showToast('提示词已复制', 'success')
    } catch {
      showToast('复制失败，请手动选择提示词', 'error')
    }
  }

  const copyAPlusText = async () => {
    if (!selectedAPlusText.trim()) {
      showToast('当前 A+ 模块没有可复制文案', 'error')
      return
    }

    try {
      await navigator.clipboard.writeText(selectedAPlusText)
      showToast('A+ 文案已复制', 'success')
    } catch {
      showToast('复制失败，请手动选择文案', 'error')
    }
  }

  const prepareReferencePayloadForRequest = async (dataUrls: string[], signal?: AbortSignal): Promise<PlannerReferenceImagePayload> => {
    if (!dataUrls.length) {
      setReferencePayloadNotice('')
      return prepareReferenceImagePayload([], { signal })
    }

    setIsPreparingReferencePayload(true)
    setReferencePayloadNotice('')
    try {
      const payload = await prepareReferenceImagePayload(dataUrls, { signal })
      if (payload.notice) setReferencePayloadNotice(payload.notice)
      return payload
    } finally {
      setIsPreparingReferencePayload(false)
    }
  }

  const selectStylePreset = async (presetId: string, options: { silent?: boolean; persist?: boolean } = {}) => {
    const preset = getStylePresetById(presetId)
    if (!preset) {
      showToast('预设风格不存在', 'error')
      return null
    }

    stylePresetAbortControllerRef.current?.abort()
    const controller = new AbortController()
    stylePresetAbortControllerRef.current = controller
    setSelectedStylePresetId(preset.id)
    setIsLoadingStylePreset(true)
    setStyleError('')

    try {
      const result = await ensureStylePresetImageStored(preset.id, controller.signal)
      if (stylePresetAbortControllerRef.current !== controller) return null
      const reference: SelectedStyleReference = {
        presetId: preset.id,
        customStyleReferenceId: null,
        imageId: result.imageId,
        dataUrl: result.dataUrl,
        label: preset.label,
        description: preset.description,
        palette: preset.palette,
      }
      setSelectedStyleReference(reference)
      if (options.persist !== false) {
        await savePlannerSession({
          selectedStylePresetId: preset.id,
          selectedStyleReferenceImageId: result.imageId,
          selectedCustomStyleReferenceId: null,
          selectedCustomStyleReferenceSnapshot: null,
          styleCandidates: [],
          styleImages: [],
          selectedStyleIndex: null,
        })
      }
      if (!options.silent) showToast(`已选择「${preset.label}」风格参考`, 'success')
      return reference
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return null
      const message = err instanceof Error ? err.message : String(err)
      setSelectedStyleReference(null)
      setStyleError(message)
      showToast('风格参考图加载失败', 'error')
      return null
    } finally {
      if (stylePresetAbortControllerRef.current === controller) {
        stylePresetAbortControllerRef.current = null
        setIsLoadingStylePreset(false)
      }
    }
  }

  const selectCustomStyleReference = async (
    customStyle: CustomStyleReference,
    options: { silent?: boolean; persist?: boolean } = {},
  ) => {
    setIsLoadingStylePreset(true)
    setStyleError('')
    try {
      let imageId = customStyle.imageId
      let dataUrl = imageId ? await ensureImageCached(imageId) : ''
      let normalizedCustomStyle = customStyle
      if (!dataUrl) {
        const rendered = await ensureCustomStyleReferenceImageStored(customStyle.editState)
        imageId = rendered.imageId
        dataUrl = rendered.dataUrl
        normalizedCustomStyle = {
          ...customStyle,
          editState: rendered.editState,
          imageId,
          updatedAt: Date.now(),
        }
        const latestSettings = useStore.getState().settings
        setSettings({
          customStyleReferences: (latestSettings.customStyleReferences ?? []).map((item) =>
            item.id === customStyle.id ? normalizedCustomStyle : item,
          ),
        })
      }

      const meta = getCustomStyleReferenceVisualMeta(normalizedCustomStyle)
      const reference: SelectedStyleReference = {
        presetId: normalizedCustomStyle.basePresetId ?? null,
        customStyleReferenceId: normalizedCustomStyle.id,
        imageId,
        dataUrl,
        label: meta.label,
        description: meta.description,
        palette: meta.palette,
      }
      setSelectedStylePresetId(normalizedCustomStyle.basePresetId ?? null)
      setSelectedStyleReference(reference)
      setCustomStyleImageDataUrls((current) => ({ ...current, [normalizedCustomStyle.id]: dataUrl }))
      if (options.persist !== false) {
        await savePlannerSession({
          selectedStylePresetId: normalizedCustomStyle.basePresetId ?? null,
          selectedStyleReferenceImageId: imageId,
          selectedCustomStyleReferenceId: normalizedCustomStyle.id,
          selectedCustomStyleReferenceSnapshot: normalizedCustomStyle,
          styleDensityMode: normalizedCustomStyle.editState.density,
          styleCandidates: [],
          styleImages: [],
          selectedStyleIndex: null,
        })
      }
      setStyleDensityMode(normalizedCustomStyle.editState.density)
      if (!options.silent) showToast(`已选择「${meta.label}」自定义风格`, 'success')
      return reference
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStyleError(message)
      showToast('自定义风格图加载失败', 'error')
      return null
    } finally {
      setIsLoadingStylePreset(false)
    }
  }

  const openStyleEditorFromPreset = (preset: StylePreset) => {
    setStyleEditor({
      mode: 'preset',
      title: `编辑「${preset.label}」`,
      basePresetId: preset.id,
      customStyleId: null,
      initialState: createStyleReferenceEditStateFromPreset(preset),
    })
  }

  const openStyleEditorFromCustom = (customStyle: CustomStyleReference) => {
    setStyleEditor({
      mode: 'custom',
      title: `编辑「${customStyle.title}」`,
      basePresetId: customStyle.basePresetId ?? null,
      customStyleId: customStyle.id,
      initialState: sanitizeStyleReferenceEditState(customStyle.editState),
    })
  }

  const saveStyleEditor = async (editState: StyleReferenceEditState) => {
    if (!styleEditor) return
    setIsSavingStyleEditor(true)
    try {
      const rendered = await ensureCustomStyleReferenceImageStored(editState)
      const now = Date.now()
      const latestSettings = useStore.getState().settings
      const currentLibrary = latestSettings.customStyleReferences ?? []
      const existing = styleEditor.customStyleId
        ? currentLibrary.find((item) => item.id === styleEditor.customStyleId)
        : null
      const title = rendered.editState.title || existing?.title || 'Custom style'
      const nextStyle: CustomStyleReference = {
        id: existing?.id ?? createCustomStyleReferenceId(),
        basePresetId: styleEditor.basePresetId,
        title,
        editState: rendered.editState,
        imageId: rendered.imageId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      const nextLibrary = existing
        ? currentLibrary.map((item) => item.id === existing.id ? nextStyle : item)
        : [nextStyle, ...currentLibrary]
      setSettings({ customStyleReferences: nextLibrary })
      setStyleEditor(null)
      await selectCustomStyleReference(nextStyle, { silent: true })
      showToast(existing ? '自定义风格已更新' : '自定义风格已保存', 'success')
    } catch (err) {
      showToast(`风格保存失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setIsSavingStyleEditor(false)
    }
  }

  const deleteCustomStyleReference = (customStyle: CustomStyleReference) => {
    const latestSettings = useStore.getState().settings
    setSettings({
      customStyleReferences: (latestSettings.customStyleReferences ?? []).filter((item) => item.id !== customStyle.id),
    })
    setCustomStyleImageDataUrls((current) => {
      const next = { ...current }
      delete next[customStyle.id]
      return next
    })
    if (selectedStyleReference?.customStyleReferenceId === customStyle.id) {
      void selectStylePreset(DEFAULT_STYLE_PRESET_ID, { silent: true })
    }
    showToast('自定义风格已删除', 'success')
  }

  const updateStylePreview = (
    preset: StylePreset,
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    setStylePreview({
      dataUrl: getStylePresetAssetUrl(preset),
      label: preset.label,
      description: preset.description,
      ...getStylePreviewPosition(event.clientX, event.clientY),
    })
  }

  const updateCustomStylePreview = (
    customStyle: CustomStyleReference,
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    const meta = getCustomStyleReferenceVisualMeta(customStyle)
    setStylePreview({
      dataUrl: customStyleImageDataUrls[customStyle.id] || renderStyleReferenceDataUrl(customStyle.editState),
      label: meta.label,
      description: meta.description,
      ...getStylePreviewPosition(event.clientX, event.clientY),
    })
  }

  const openStylePresetPreview = async (presetId: string) => {
    const reference = selectedStyleReference?.presetId === presetId
      ? selectedStyleReference
      : await selectStylePreset(presetId, { silent: true })
    if (reference?.imageId) setLightboxImageId(reference.imageId, [reference.imageId])
  }

  const openCustomStylePreview = async (customStyle: CustomStyleReference) => {
    const reference = selectedStyleReference?.customStyleReferenceId === customStyle.id
      ? selectedStyleReference
      : await selectCustomStyleReference(customStyle, { silent: true })
    if (reference?.imageId) setLightboxImageId(reference.imageId, [reference.imageId])
  }

  const applyPlannerResult = (result: PlannerApiResult, sourceLabel: string) => {
    const firstPlan = result.plans[0]
    const nextDraft = {
      ...draft,
      ...result.parsed.inferred,
      productTitle: result.parsed.title || draft.productTitle,
      sellingPoints: result.parsed.bullets.length ? result.parsed.bullets.join('\n') : draft.sellingPoints,
      ...(firstPlan?.kind ? { kind: firstPlan.kind } : {}),
    }
    const nextSeriesStyleGuides = {
      ...seriesStyleGuides,
      [result.mode === 'aplus' ? 'aplus' : 'listing']: result.seriesStyleGuide,
    }
    const nextImagePlans = result.mode === 'listing' ? result.plans : []
    const nextAPlusPlans = result.mode === 'aplus' ? withAPlusGenerationSizes(result.aPlusPlans, resolutionTier) : []
    const nextSelectedPlanIndex = result.mode === 'listing' && result.plans.length ? 0 : null
    const nextSelectedAPlusPlanIndex = result.mode === 'aplus' && result.aPlusPlans.length ? 0 : null

    setDraft(nextDraft)
    if (result.mode === 'aplus') {
      setAPlusPlans(nextAPlusPlans)
      setImagePlans([])
      setSelectedAPlusPlanIndex(nextSelectedAPlusPlanIndex)
      setSelectedPlanIndex(null)
    } else {
      setImagePlans(nextImagePlans)
      setAPlusPlans([])
      setSelectedPlanIndex(nextSelectedPlanIndex)
      setSelectedAPlusPlanIndex(null)
    }
    setSeriesStyleGuides(nextSeriesStyleGuides)
    setSelectedStylePresetId(DEFAULT_STYLE_PRESET_ID)
    setSelectedStyleReference(null)
    setStylePreview(null)
    setStyleError('')
    setPlannerError('')
    setActionProgress({})
    void savePlannerSession({
      id: createPlannerSessionId(),
      mode: result.mode,
      listingImageCount,
      aPlusModuleSpecs: getAPlusModuleSpecsForSession(aPlusModuleSpecsByType),
      draft: toSessionDraft(nextDraft),
      seriesStyleGuides: nextSeriesStyleGuides,
      styleCandidates: [],
      styleImages: [],
      selectedStyleIndex: null,
      selectedStylePresetId: DEFAULT_STYLE_PRESET_ID,
      selectedStyleReferenceImageId: null,
      selectedCustomStyleReferenceId: null,
      selectedCustomStyleReferenceSnapshot: null,
      styleDensityMode,
      imagePlans: nextImagePlans,
      aPlusPlans: nextAPlusPlans,
      selectedPlanIndex: nextSelectedPlanIndex,
      selectedAPlusPlanIndex: nextSelectedAPlusPlanIndex,
    })
      .then((session) => selectStylePreset(DEFAULT_STYLE_PRESET_ID, { silent: true, persist: false })
        .then((reference) => {
          if (!reference) return
          const nextSession = {
            ...session,
            selectedStylePresetId: reference.presetId,
            selectedStyleReferenceImageId: reference.imageId,
            selectedCustomStyleReferenceId: null,
            selectedCustomStyleReferenceSnapshot: null,
            updatedAt: Date.now(),
          }
          void putAmazonPlannerSession(nextSession)
            .then(() => upsertPlannerSessionList(nextSession))
            .catch((err) => {
              showToast(`策划历史保存失败：${err instanceof Error ? err.message : String(err)}`, 'error')
            })
        }))
      .catch((err) => {
      showToast(`策划历史保存失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    })
    showToast(`${sourceLabel}已生成 ${result.mode === 'aplus' ? result.aPlusPlans.length : result.plans.length} 张图片策划`, 'success')
  }

  const createAiPlan = async () => {
    if (plannerAbortControllerRef.current) {
      showToast('AI 策划正在进行中', 'info')
      return
    }
    if (!listingText.trim()) {
      showToast('请先粘贴标题和五点描述', 'error')
      return
    }

    if (!plannerProfile) {
      setPlannerError('未选择支持 Chat Completions 或 Responses API 的 AI 策划配置。\n\n请在设置 -> API 中创建或选择一个 Chat Completions 配置，例如 DeepSeek 文本模型；生图配置继续使用 Images API，不要把 gpt-image-2 用作策划模型。')
      showToast('AI 策划配置缺失', 'error')
      return
    }
    if (plannerProfileValidation) {
      setPlannerError(`AI 策划配置「${plannerProfile.name}」不完整：${plannerProfileValidation}`)
      showToast('AI 策划配置不完整', 'error')
      return
    }

    const controller = new AbortController()
    plannerAbortControllerRef.current = controller
    setIsPlanning(true)
    setPlannerError('')
    try {
      const referencePayload = await prepareReferencePayloadForRequest(inputImages.map((image) => image.dataUrl), controller.signal)
      const result = await callAmazonPlannerApi({
        listingText,
        baseDraft: draft,
        profile: plannerProfile,
        referenceImageDataUrls: referencePayload.dataUrls,
        mode: plannerMode,
        listingImageCount,
        aPlusType,
        aPlusModuleSpecs: aPlusSpecs,
        aPlusGenerationTier: resolutionTier,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      applyPlannerResult(result, plannerMode === 'aplus' ? 'A+ AI 策划' : 'AI 策划')
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return
      setPlannerError(getPlannerFailureDetail(err))
      showToast('AI 策划失败，请查看详情', 'error')
    } finally {
      if (plannerAbortControllerRef.current === controller) {
        plannerAbortControllerRef.current = null
        setIsPlanning(false)
      }
    }
  }

  const stopAiPlan = () => {
    const controller = plannerAbortControllerRef.current
    if (!controller) return
    controller.abort()
    plannerAbortControllerRef.current = null
    setIsPlanning(false)
    showToast('AI 策划已停止', 'info')
  }

  const changeStyleDensityMode = (mode: AmazonStyleDensityMode) => {
    setStyleDensityMode(mode)
    updateCurrentPlannerSession({ styleDensityMode: mode })
  }

  const selectPlan = (index: number) => {
    const plan = imagePlans[index]
    setSelectedPlanIndex(plan ? index : null)
    if (plan) {
      setDraft((current) => plan.kind ? { ...current, kind: plan.kind } : current)
    }
    updateCurrentPlannerSession({
      selectedPlanIndex: plan ? index : null,
      draft: toSessionDraft(plan?.kind ? { ...draft, kind: plan.kind } : draft),
    })
  }

  const selectAPlusPlan = (index: number) => {
    const plan = aPlusPlansWithSizes[index]
    setSelectedAPlusPlanIndex(plan ? index : null)
    updateCurrentPlannerSession({
      selectedAPlusPlanIndex: plan ? index : null,
    })
  }

  const selectVisiblePlan = (index: number) => {
    if (plannerMode === 'aplus') selectAPlusPlan(index)
    else selectPlan(index)
  }

  const stepVisiblePlan = (direction: -1 | 1) => {
    if (visiblePlanCount === 0 || visiblePlanIndex == null) return
    const nextIndex = Math.min(visiblePlanCount - 1, Math.max(0, visiblePlanIndex + direction))
    if (nextIndex !== visiblePlanIndex) selectVisiblePlan(nextIndex)
  }

  const changePlannerMode = (mode: AmazonPlannerMode) => {
    if (mode === plannerMode) return
    setPlannerMode(mode)
    setStylePreview(null)
    setStyleError('')
    setActionProgress({})
  }

  const changeAPlusType = (nextType: APlusContentType) => {
    setAPlusType(nextType)
    if (nextType !== aPlusType) {
      setAPlusPlans([])
      setSelectedAPlusPlanIndex(null)
      setSeriesStyleGuides((current) => ({ ...current, aplus: '' }))
      setSelectedStylePresetId(DEFAULT_STYLE_PRESET_ID)
      setSelectedStyleReference(null)
      setStylePreview(null)
      setStyleError('')
      setActionProgress({})
    }
  }

  const changeListingImageCount = (value: string) => {
    const nextCount = normalizeListingImageCount(value)
    setListingImageCount(nextCount)
    updateCurrentPlannerSession({ listingImageCount: nextCount })
  }

  const saveAPlusModuleSpecsByType = (nextSpecsByType: APlusModuleSpecsByType) => {
    const sessionSpecs = getAPlusModuleSpecsForSession(nextSpecsByType)
    updateCurrentPlannerSession({ aPlusModuleSpecs: sessionSpecs })
  }

  const updateCurrentAPlusModuleSpecs = (nextSpecs: AmazonAPlusModuleSpec[]) => {
    const normalizedSpecs = normalizeAPlusModuleSpecs(aPlusType, nextSpecs)
    const next = { ...aPlusModuleSpecsByType }
    if (areAPlusModuleSpecsEquivalent(normalizedSpecs, getAPlusModuleSpecs(aPlusType))) {
      delete next[aPlusType]
    } else {
      next[aPlusType] = normalizedSpecs
    }
    setAPlusModuleSpecsByType(next)
    saveAPlusModuleSpecsByType(next)
  }

  const addAPlusModuleAfter = (index: number) => {
    if (isPlanning || aPlusPlans.length > 0 || aPlusSpecs.length >= MAX_A_PLUS_MODULE_COUNT) return
    updateCurrentAPlusModuleSpecs(insertAPlusModuleSpecAfter(aPlusType, aPlusSpecs, index))
  }

  const removeAPlusModuleAt = (index: number) => {
    if (isPlanning || aPlusPlans.length > 0 || aPlusSpecs.length <= MIN_A_PLUS_MODULE_COUNT) return
    updateCurrentAPlusModuleSpecs(removeAPlusModuleSpecAt(aPlusType, aPlusSpecs, index))
  }

  const restoreDefaultAPlusModules = () => {
    if (isPlanning || aPlusPlans.length > 0 || aPlusSpecsAreDefault) return
    const next = { ...aPlusModuleSpecsByType }
    delete next[aPlusType]
    setAPlusModuleSpecsByType(next)
    saveAPlusModuleSpecsByType(next)
  }

  const clearListingPlan = () => {
    setListingText('')
    setListingImageCount(DEFAULT_LISTING_IMAGE_COUNT)
    setAPlusModuleSpecsByType({})
    setImagePlans([])
    setAPlusPlans([])
    setSeriesStyleGuides({ listing: '', aplus: '' })
    setSelectedStylePresetId(DEFAULT_STYLE_PRESET_ID)
    setSelectedStyleReference(null)
    setStyleDensityMode('rich')
    setStylePreview(null)
    setStyleError('')
    setSelectedPlanIndex(null)
    setSelectedAPlusPlanIndex(null)
    setPlannerError('')
    setCurrentPlannerSessionId(null)
    setActionProgress({})
  }

  const restorePlannerSession = async (session: AmazonPlannerSession) => {
    const restoredReferences = []
    for (const imageId of session.referenceImageIds) {
      const dataUrl = await ensureImageCached(imageId)
      if (dataUrl) restoredReferences.push({ id: imageId, dataUrl })
    }

    const nextStylePresetId = getStylePresetById(session.selectedStylePresetId)
      ? session.selectedStylePresetId!
      : DEFAULT_STYLE_PRESET_ID
    let restoredStyleReference: SelectedStyleReference | null = null
    let restoredCustomStyleReference: CustomStyleReference | null = null
    let restoredStyleError = ''

    const sessionCustomStyle = session.selectedCustomStyleReferenceId
      ? customStyleReferences.find((style) => style.id === session.selectedCustomStyleReferenceId) ?? session.selectedCustomStyleReferenceSnapshot ?? null
      : session.selectedCustomStyleReferenceSnapshot ?? null
    if (sessionCustomStyle) {
      try {
        let customStyle = sessionCustomStyle
        let dataUrl = customStyle.imageId ? await ensureImageCached(customStyle.imageId) : ''
        if (!dataUrl) {
          const rendered = await ensureCustomStyleReferenceImageStored(customStyle.editState)
          customStyle = {
            ...customStyle,
            editState: rendered.editState,
            imageId: rendered.imageId,
            updatedAt: Date.now(),
          }
          dataUrl = rendered.dataUrl
          if (customStyleReferences.some((style) => style.id === customStyle.id)) {
            setSettings({
              customStyleReferences: customStyleReferences.map((style) =>
                style.id === customStyle.id ? customStyle : style,
              ),
            })
          }
        }
        const meta = getCustomStyleReferenceVisualMeta(customStyle)
        restoredCustomStyleReference = customStyle
        restoredStyleReference = {
          presetId: customStyle.basePresetId ?? null,
          customStyleReferenceId: customStyle.id,
          imageId: customStyle.imageId,
          dataUrl,
          label: meta.label,
          description: meta.description,
          palette: meta.palette,
        }
      } catch (err) {
        restoredStyleError = `历史中的自定义风格恢复失败：${err instanceof Error ? err.message : String(err)}`
      }
    }

    if (!restoredStyleReference && session.selectedStyleReferenceImageId) {
      const dataUrl = await ensureImageCached(session.selectedStyleReferenceImageId)
      if (dataUrl) {
        const preset = getStylePresetById(nextStylePresetId)
        restoredStyleReference = {
          presetId: preset?.id ?? null,
          customStyleReferenceId: null,
          imageId: session.selectedStyleReferenceImageId,
          dataUrl,
          label: preset?.label ?? '历史风格',
          description: preset?.description ?? '从策划历史恢复的隐藏风格参考。',
          palette: preset?.palette ?? [],
        }
      }
    }

    if (!restoredStyleReference && session.selectedStyleIndex != null) {
      const legacyStyle = session.styleImages.find((image) => image.candidateIndex === session.selectedStyleIndex)
      if (legacyStyle?.imageId) {
        const dataUrl = await ensureImageCached(legacyStyle.imageId)
        if (dataUrl) {
          const legacyCandidate = session.styleCandidates[session.selectedStyleIndex]
          restoredStyleReference = {
            presetId: null,
            customStyleReferenceId: null,
            imageId: legacyStyle.imageId,
            dataUrl,
            label: legacyCandidate?.label || '历史风格板',
            description: legacyCandidate?.description || '从旧版策划历史恢复的隐藏风格参考。',
            palette: [],
          }
        } else {
          restoredStyleError = '历史中的风格板图片不存在，已切换为默认风格参考。'
        }
      }
    }

    if (!restoredStyleReference && nextStylePresetId) {
      try {
        const result = await ensureStylePresetImageStored(nextStylePresetId)
        restoredStyleReference = {
          presetId: nextStylePresetId,
          customStyleReferenceId: null,
          imageId: result.imageId,
          dataUrl: result.dataUrl,
          label: result.preset.label,
          description: result.preset.description,
          palette: result.preset.palette,
        }
      } catch (err) {
        restoredStyleError = err instanceof Error ? err.message : String(err)
      }
    }

    const restoredAPlusModuleSpecsByType = getSessionAPlusModuleSpecsByType(session)
    setPlannerMode(session.mode)
    setAPlusType(session.aPlusType)
    setResolution(session.resolution)
    setListingImageCount(getSessionListingImageCount(session))
    setAPlusModuleSpecsByType(restoredAPlusModuleSpecsByType)
    setListingText(session.listingText)
    setInputImages(restoredReferences)
    setDraft(fromSessionDraft(session.draft))
    setSeriesStyleGuides(session.seriesStyleGuides)
    setSelectedStylePresetId(restoredStyleReference ? restoredStyleReference.presetId : nextStylePresetId)
    setSelectedStyleReference(restoredStyleReference)
    setStyleDensityMode(restoredCustomStyleReference?.editState.density ?? session.styleDensityMode ?? 'rich')
    setStylePreview(null)
    setImagePlans(session.imagePlans as AmazonImagePlan[])
    setAPlusPlans(session.aPlusPlans as AmazonAPlusPlan[])
    setSelectedPlanIndex(session.selectedPlanIndex != null && session.imagePlans[session.selectedPlanIndex] ? session.selectedPlanIndex : null)
    setSelectedAPlusPlanIndex(session.selectedAPlusPlanIndex != null && session.aPlusPlans[session.selectedAPlusPlanIndex] ? session.selectedAPlusPlanIndex : null)
    setPlannerError('')
    setStyleError(restoredStyleError)
    setCurrentPlannerSessionId(session.id)
    setShowPlannerHistory(false)
    setActionProgress({})
    const restoredSession = {
      ...session,
      listingImageCount: getSessionListingImageCount(session),
      aPlusModuleSpecs: getAPlusModuleSpecsForSession(restoredAPlusModuleSpecsByType),
      selectedStylePresetId: restoredStyleReference ? restoredStyleReference.presetId : nextStylePresetId,
      selectedStyleReferenceImageId: restoredStyleReference?.imageId ?? null,
      selectedCustomStyleReferenceId: restoredCustomStyleReference?.id ?? null,
      selectedCustomStyleReferenceSnapshot: restoredCustomStyleReference,
      styleDensityMode: restoredCustomStyleReference?.editState.density ?? session.styleDensityMode ?? 'rich',
      updatedAt: Date.now(),
    }
    void putAmazonPlannerSession(restoredSession)
      .then(() => upsertPlannerSessionList(restoredSession))
      .catch((err) => {
        showToast(`策划历史保存失败：${err instanceof Error ? err.message : String(err)}`, 'error')
      })
    showToast('策划历史已恢复', 'success')
  }

  const removePlannerSession = async (sessionId: string) => {
    try {
      await deleteAmazonPlannerSession(sessionId)
      setPlannerSessions((current) => current.filter((session) => session.id !== sessionId))
      if (currentPlannerSessionId === sessionId) setCurrentPlannerSessionId(null)
      showToast('策划历史已删除', 'success')
    } catch (err) {
      showToast(`策划历史删除失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const copyPlannerError = async () => {
    try {
      await navigator.clipboard.writeText(plannerError)
      showToast('错误详情已复制', 'success')
    } catch {
      showToast('复制错误详情失败', 'error')
    }
  }

  const handleFiles = async (files: FileList | File[]) => {
    const accepted = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (accepted.length === 0) {
      showToast('请选择图片文件', 'error')
      return
    }

    const currentCount = useStore.getState().inputImages.length
    if (currentCount >= API_MAX_IMAGES) {
      showToast(`参考图数量已达上限（${API_MAX_IMAGES} 张），无法继续添加`, 'error')
      return
    }

    const remaining = API_MAX_IMAGES - currentCount
    const toAdd = accepted.slice(0, remaining)
    const discarded = accepted.length - toAdd.length

    try {
      for (const file of toAdd) {
        await addImageFromFile(file)
      }

      const added = useStore.getState().inputImages.length - currentCount
      updateCurrentPlannerSession({
        referenceImageIds: useStore.getState().inputImages.map((image) => image.id),
      })
      if (discarded > 0) {
        showToast(
          added > 0
            ? `已上传 ${added} 张参考图，已达上限 ${API_MAX_IMAGES} 张，${discarded} 张被丢弃`
            : `已达上限 ${API_MAX_IMAGES} 张，${discarded} 张图片被丢弃`,
          added > 0 ? 'success' : 'error',
        )
        return
      }

      showToast(added > 0 ? `已上传 ${added} 张参考图` : '参考图已存在', added > 0 ? 'success' : 'info')
    } catch (err) {
      showToast(`参考图上传失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    await handleFiles(event.target.files || [])
    event.target.value = ''
  }

  return (
    <>
    {styleEditor && (
      <StyleReferenceEditorModal
        title={styleEditor.title}
        initialState={styleEditor.initialState}
        saving={isSavingStyleEditor}
        onClose={() => setStyleEditor(null)}
        onSave={(state) => void saveStyleEditor(state)}
      />
    )}
    <section data-no-drag-select className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-4 dark:border-white/[0.08] sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50">亚马逊图片工作台</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>OpenAI gpt-image-2</span>
              <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
              <span>2K / 4K</span>
              <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
              <span>主图、附图与 A+ 策划</span>
            </div>
            <div className="mt-3 inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
              {([
                ['listing', 'Listing 图'],
                ['aplus', 'A+ 图'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changePlannerMode(mode)}
                  className={`h-8 rounded-lg px-3 text-sm font-medium transition ${plannerMode === mode ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {plannerMode === 'listing' && (
              <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-300">
                <span className="text-xs text-gray-400 dark:text-gray-500">图片数</span>
                <select
                  value={listingImageCount}
                  onChange={(event) => changeListingImageCount(event.target.value)}
                  className="h-7 rounded-md border border-gray-200 bg-gray-50 px-2 text-sm font-semibold text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-gray-100"
                >
                  {LISTING_IMAGE_COUNT_OPTIONS.map((count) => (
                    <option key={count} value={count}>{count} 张</option>
                  ))}
                </select>
              </label>
            )}
            <div className="inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
              {(['2k', '4k'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setResolution(item)}
                  className={`h-8 min-w-14 rounded-lg px-3 text-sm font-medium transition ${resolution === item ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowPlannerHistory((value) => !value)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition ${showPlannerHistory ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
            >
              <HistoryIcon className="h-4 w-4" />
              策划历史
              {plannerSessions.length > 0 && (
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-white/[0.08] dark:text-gray-300">
                  {plannerSessions.length}
                </span>
              )}
            </button>
          </div>
        </div>
        {showPlannerHistory && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">策划历史</div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  保存在当前浏览器中，恢复后会带回 Listing、策划卡片和已选风格参考。
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPlannerHistory(false)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
              >
                收起
              </button>
            </div>
            {plannerSessions.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {plannerSessions.map((session) => (
                  <div key={session.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-gray-900">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{session.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                          <span>{session.mode === 'aplus' ? 'A+ 图' : 'Listing 图'}</span>
                          <span>·</span>
                          <span>{session.mode === 'aplus' ? getAPlusContentTypeLabel(session.aPlusType) : `${session.imagePlans.length} 张`}</span>
                          <span>·</span>
                          <span>{formatPlannerSessionTime(session.updatedAt)}</span>
                        </div>
                      </div>
                      {currentPlannerSessionId === session.id && (
                        <span className="shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">当前</span>
                      )}
                    </div>
                    <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      {session.listingText || session.draft.sellingPoints || '无 Listing 文本'}
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void restorePlannerSession(session).catch((err) => {
                            showToast(`策划历史恢复失败：${err instanceof Error ? err.message : String(err)}`, 'error')
                          })
                        }}
                        className="inline-flex h-8 items-center rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white transition hover:bg-gray-700 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        onClick={() => void removePlannerSession(session.id)}
                        className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-400/10"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-4 text-center text-xs text-gray-500 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-400">
                暂无策划历史。AI 策划成功后会自动保存。
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="border-b border-gray-200 p-4 dark:border-white/[0.08] sm:p-5 lg:border-b-0 lg:border-r">
          <div className={`rounded-xl border p-3 shadow-sm transition ${getGuidePanelClass(plannerGuideActive)}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {plannerMode === 'aplus' ? 'A+ 图片策划' : 'Listing 智能策划'}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {plannerMode === 'aplus'
                    ? '粘贴标题、五点描述或品牌说明，生成普通A+ / 标准A+ / 高级A+ / 手机A+模块编排和英文提示词。'
                    : `粘贴标题、五点描述或产品说明，生成 ${listingSlotRange} 的逐张方案和英文提示词。`}
                </div>
              </div>
              <div className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                双配置
              </div>
            </div>
            {plannerGuideActive && (
              <div className={`${GUIDE_HINT_CLASS} mt-3`}>
                {guideState.message}
              </div>
            )}
            {plannerMode === 'aplus' && (
              <div className="mt-3 inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
                {([
                  ['standard-large', '普通A+'],
                  ['standard', '标准A+'],
                  ['premium', '高级A+'],
                  ['mobile', '手机A+'],
                ] as const).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => changeAPlusType(type)}
                    className={`h-8 rounded-lg px-3 text-sm font-medium transition ${aPlusType === type ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <label className={`mt-3 block rounded-xl transition ${getGuideFocusClass(guideState.target === 'planner-input')}`}>
              <span className={LABEL_CLASS}>{plannerMode === 'aplus' ? '标题 / 五点描述 / 品牌说明' : '标题 / 五点描述'}</span>
              <textarea
                value={listingText}
                onChange={(event) => setListingText(event.target.value)}
                className={`${FIELD_CLASS} min-h-[138px] resize-y`}
                placeholder={plannerMode === 'aplus'
                  ? 'Title: ...\n\nAbout this item\n- Bullet 1...\n- Bullet 2...\n\nBrand story / tone: ...'
                  : 'Title: ...\n\nAbout this item\n- Bullet 1...\n- Bullet 2...\n- Bullet 3...\n- Bullet 4...\n- Bullet 5...'}
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className={`rounded-xl border px-3 py-2 transition ${guideState.target === 'planner-api' ? 'border-blue-300 bg-blue-50 text-blue-800 ring-2 ring-blue-500/15 dark:border-blue-400/60 dark:bg-blue-500/10 dark:text-blue-100' : plannerProfile && !plannerProfileValidation ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200'}`}>
                <div className="text-xs font-semibold">AI 策划配置</div>
                <div className="mt-1 text-xs leading-relaxed">
                  {plannerProfile ? `${plannerProfile.name} · ${plannerProfile.model} · ${plannerApiLabel}` : '未配置，请在设置中选择一个 Chat Completions 策划配置'}
                  {plannerProfileValidation ? `（${plannerProfileValidation}）` : ''}
                </div>
              </div>
              <div className={`flex flex-wrap items-center gap-2 rounded-xl transition sm:justify-end ${getGuideFocusClass(guideState.target === 'planner-action')}`}>
                <button
                  type="button"
                  onClick={createAiPlan}
                  disabled={isPlanning || Boolean(plannerProfileValidation)}
                  className={`inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-white transition ${isPlanning ? 'cursor-wait bg-gray-400' : plannerProfileValidation ? 'cursor-not-allowed bg-gray-300 dark:bg-white/[0.12]' : 'bg-blue-600 hover:bg-blue-500'} ${guideState.target === 'planner-action' ? 'ring-2 ring-blue-500/25 ring-offset-2 ring-offset-white dark:ring-offset-gray-950' : ''}`}
                >
                  {isPlanning ? '策划中...' : plannerMode === 'aplus' ? 'AI策划A+' : 'AI策划'}
                </button>
                {isPlanning && (
                  <button
                    type="button"
                    onClick={stopAiPlan}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-400/20 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-400/10"
                  >
                    <CloseIcon className="h-4 w-4" />
                    停止
                  </button>
                )}
                {(listingText.trim() || imagePlans.length > 0 || aPlusPlans.length > 0) && (
                  <button
                    type="button"
                    onClick={clearListingPlan}
                    className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                  >
                    清空
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowSettings(true, 'api')}
                  className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-blue-600 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-400/10"
                >
                  设置
                </button>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
              AI策划使用设置中的策划配置，生图配置保持不变。
            </div>
            {plannerUsesOfficialDeepSeek && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
                {DEEPSEEK_PLANNER_NOTICE}
              </div>
            )}
            {plannerError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold">AI 策划失败详情</span>
                  <button
                    type="button"
                    onClick={copyPlannerError}
                    className="rounded-md px-2 py-1 text-[11px] font-medium text-red-700 transition hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-400/10"
                  >
                    复制错误
                  </button>
                </div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">{plannerError}</pre>
              </div>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">参考图</div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {inputImages.length > 0
                    ? `${inputImages.length}/${API_MAX_IMAGES} 张产品参考图${usesStyleReferenceForActivePlan ? `；正式生成时另附 1 张隐藏风格参考图（实际 ${effectiveReferenceCount}/${API_MAX_IMAGES}）` : '，将随生成请求一起发送'}`
                    : usesStyleReferenceForActivePlan
                      ? `未上传产品参考图；正式生成时会附 1 张隐藏风格参考图`
                      : '建议上传产品实拍、包装或结构参考图'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => !atImageLimit && fileInputRef.current?.click()}
                  disabled={atImageLimit}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${atImageLimit ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.04] dark:text-gray-500' : 'bg-white text-gray-700 shadow-sm hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
                >
                  <PlusIcon className="h-4 w-4" />
                  上传参考图
                </button>
                <button
                  type="button"
                  onClick={() => !atImageLimit && cameraInputRef.current?.click()}
                  disabled={atImageLimit}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition sm:hidden ${atImageLimit ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.04] dark:text-gray-500' : 'bg-white text-gray-700 shadow-sm hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
                >
                  <PhotoIcon className="h-4 w-4" />
                  拍照
                </button>
                {inputImages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      clearInputImages()
                      updateCurrentPlannerSession({ referenceImageIds: [] })
                    }}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-400/20 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-400/10"
                  >
                    <TrashIcon className="h-4 w-4" />
                    清空
                  </button>
                )}
              </div>
            </div>

            {(isPreparingReferencePayload || referencePayloadNotice) && (
              <div className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed ${isPreparingReferencePayload ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200'}`}>
                {isPreparingReferencePayload ? '正在压缩参考图...' : referencePayloadNotice}
              </div>
            )}

            {inputImages.length > 0 ? (
              <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,72px)]">
                {inputImages.map((image, index) => (
                  <div key={image.id} className="group relative aspect-square overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-gray-900">
                    <img src={image.dataUrl} alt={`参考图 ${index + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute bottom-1 left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/60 px-1.5 text-[10px] font-semibold text-white">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const nextReferenceImageIds = inputImages.filter((_, imageIndex) => imageIndex !== index).map((item) => item.id)
                        removeInputImage(index)
                        updateCurrentPlannerSession({ referenceImageIds: nextReferenceImageIds })
                      }}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-100 transition hover:bg-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label={`删除参考图 ${index + 1}`}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 flex min-h-[88px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-white/[0.12] dark:bg-gray-900 dark:hover:border-blue-400/50 dark:hover:bg-blue-400/10"
              >
                <PhotoIcon className="h-5 w-5 text-gray-400" />
                <span className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-200">上传产品参考图</span>
                <span className="mt-1 text-xs text-gray-400">支持多选、拖到底部输入栏或直接在这里选择文件</span>
              </button>
            )}

            {atImageLimit && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                参考图数量已达上限（{API_MAX_IMAGES} 张），请删除不需要的图片后再上传。
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label>
              <span className={LABEL_CLASS}>商品标题</span>
              <input
                value={draft.productTitle}
                onChange={(event) => setDraft((current) => updateDraft(current, 'productTitle', event.target.value))}
                className={FIELD_CLASS}
                placeholder="例：Stainless Steel Insulated Travel Mug"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>类目</span>
              <input
                value={draft.category}
                onChange={(event) => setDraft((current) => updateDraft(current, 'category', event.target.value))}
                className={FIELD_CLASS}
                placeholder="例：Kitchen / Sports / Home"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>品牌 / 型号</span>
              <input
                value={draft.brand}
                onChange={(event) => setDraft((current) => updateDraft(current, 'brand', event.target.value))}
                className={FIELD_CLASS}
                placeholder="只填商品真实品牌或型号"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>颜色</span>
              <input
                value={draft.color}
                onChange={(event) => setDraft((current) => updateDraft(current, 'color', event.target.value))}
                className={FIELD_CLASS}
                placeholder="例：matte black"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>材质 / 表面工艺</span>
              <input
                value={draft.material}
                onChange={(event) => setDraft((current) => updateDraft(current, 'material', event.target.value))}
                className={FIELD_CLASS}
                placeholder="例：304 stainless steel, silicone lid"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>目标人群</span>
              <input
                value={draft.audience}
                onChange={(event) => setDraft((current) => updateDraft(current, 'audience', event.target.value))}
                className={FIELD_CLASS}
                placeholder="例：commuters, office workers"
              />
            </label>
            <label className="md:col-span-2">
              <span className={LABEL_CLASS}>卖点</span>
              <textarea
                value={draft.sellingPoints}
                onChange={(event) => setDraft((current) => updateDraft(current, 'sellingPoints', event.target.value))}
                className={`${FIELD_CLASS} min-h-[86px] resize-y`}
                placeholder="一行一个卖点，或用分号分隔"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>包装清单</span>
              <textarea
                value={draft.packageIncludes}
                onChange={(event) => setDraft((current) => updateDraft(current, 'packageIncludes', event.target.value))}
                className={`${FIELD_CLASS} min-h-[76px] resize-y`}
                placeholder="例：1 mug, 1 lid, 1 straw"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>场景 / 构图</span>
              <textarea
                value={draft.scene}
                onChange={(event) => setDraft((current) => updateDraft(current, 'scene', event.target.value))}
                className={`${FIELD_CLASS} min-h-[76px] resize-y`}
                placeholder="例：白底产品构图 / 厨房台面场景 / 尺寸标注信息图"
              />
            </label>
            <label className="md:col-span-2">
              <span className={LABEL_CLASS}>禁用元素</span>
              <input
                value={draft.forbidden}
                onChange={(event) => setDraft((current) => updateDraft(current, 'forbidden', event.target.value))}
                className={FIELD_CLASS}
                placeholder="例：do not show phone, laptop, gift box"
              />
            </label>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {showStickyActions && (
            <>
              {mobileActionDock && (
                <button
                  type="button"
                  data-amazon-action-dock
                  onClick={() => setMobileActionDock(null)}
                  className={`fixed top-[7.25rem] z-30 flex min-h-[104px] w-12 flex-col items-center justify-center gap-1 border border-blue-200 bg-white/95 px-1.5 py-2 text-blue-700 shadow-lg shadow-gray-900/10 backdrop-blur transition hover:bg-blue-50 sm:hidden dark:border-blue-300/25 dark:bg-gray-950/95 dark:text-blue-200 dark:hover:bg-blue-400/10 ${mobileActionDock === 'left' ? 'left-0 rounded-r-xl border-l-0' : 'right-0 rounded-l-xl border-r-0'}`}
                  aria-label="展开移动端生成操作窗"
                  title="展开操作窗"
                >
                  {mobileActionDock === 'left' ? (
                    <ChevronRightIcon className="h-4 w-4" />
                  ) : (
                    <ChevronLeftIcon className="h-4 w-4" />
                  )}
                  <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {actionSlot ?? (plannerMode === 'aplus' ? 'A+' : '当前')}
                  </span>
                  <span className="[writing-mode:vertical-rl] text-[11px] font-semibold tracking-wide">展开</span>
                </button>
              )}
              <div data-amazon-action-bar className={`z-30 rounded-xl border p-3 shadow-lg shadow-gray-900/5 backdrop-blur transition dark:shadow-black/20 sm:sticky sm:left-auto sm:right-auto sm:top-20 sm:mb-4 ${mobileActionDock ? 'hidden sm:block' : 'fixed left-3 right-3 top-[7.25rem]'} ${getGuidePanelClass(actionBarGuideActive)}`}>
                <button
                  type="button"
                  onClick={() => setMobileActionDock('left')}
                  className="absolute -left-3 top-1/2 flex h-24 w-7 -translate-y-1/2 items-center justify-center rounded-r-xl border border-blue-200 bg-white/95 text-blue-700 shadow-sm transition hover:bg-blue-50 sm:hidden dark:border-blue-300/25 dark:bg-gray-950/95 dark:text-blue-200 dark:hover:bg-blue-400/10"
                  aria-label="收起到左侧"
                  title="收起到左侧"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMobileActionDock('right')}
                  className="absolute -right-3 top-1/2 flex h-24 w-7 -translate-y-1/2 items-center justify-center rounded-l-xl border border-blue-200 bg-white/95 text-blue-700 shadow-sm transition hover:bg-blue-50 sm:hidden dark:border-blue-300/25 dark:bg-gray-950/95 dark:text-blue-200 dark:hover:bg-blue-400/10"
                  aria-label="收起到右侧"
                  title="收起到右侧"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
                <div className="flex flex-col gap-3">
                  {actionBarGuideActive && (
                    <div className={GUIDE_HINT_CLASS}>
                      {guideState.message}
                    </div>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
                          {actionSlot ?? (plannerMode === 'aplus' ? 'A+' : '当前')}
                        </span>
                        <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {actionLabel ?? (plannerMode === 'aplus' ? '请选择 A+ 模块' : '当前图片方案')}
                        </span>
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-white/[0.08] dark:text-gray-300">
                          {actionPositionLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        {targetSize} / {generationParamLabel}{plannerMode === 'aplus' && selectedAPlusPlan ? ` · 上传建议 ${selectedAPlusPlan.uploadSize}` : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => stepVisiblePlan(-1)}
                        disabled={!canGoPrev}
                        className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition ${canGoPrev ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]' : 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 dark:border-white/[0.04] dark:bg-white/[0.04] dark:text-gray-600'}`}
                      >
                        <ChevronLeftIcon className="h-3.5 w-3.5" />
                        上一张
                      </button>
                      <button
                        type="button"
                        onClick={() => stepVisiblePlan(1)}
                        disabled={!canGoNext}
                        className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition ${currentActionSubmitted && canGoNext ? 'border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-500' : canGoNext ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]' : 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 dark:border-white/[0.04] dark:bg-white/[0.04] dark:text-gray-600'}`}
                      >
                        下一张
                        <ChevronRightIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${currentActionSubmitted ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200' : currentActionFilled ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200' : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200'}`}>
                    {actionGuidance}
                    {mainStyleGuidance && (
                      <span className="mt-1 block text-[11px] font-normal opacity-80">{mainStyleGuidance}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {actionProgressSteps.map((step) => (
                      <div key={step.label} className={`rounded-lg border px-2 py-1.5 ${getActionStepClass(step.status)}`}>
                        <div className="truncate text-[10px] font-bold">{step.label}</div>
                        <div className="mt-0.5 truncate text-[10px] opacity-80">{step.detail}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={copyPrompt}
                      disabled={actionDisabled}
                      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition ${actionDisabled ? 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 dark:border-white/[0.04] dark:bg-white/[0.04] dark:text-gray-600' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
                    >
                      <CopyIcon className="h-3.5 w-3.5" />
                      复制
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPrompt()}
                      disabled={actionDisabled}
                      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition ${actionDisabled ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06] dark:text-gray-600' : currentActionFilled ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200'}`}
                    >
                      {currentActionFilled ? (
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <PhotoIcon className="h-3.5 w-3.5" />
                      )}
                      {currentActionFilled ? '已填入' : '填入'}
                    </button>
                    <button
                      type="button"
                      onClick={applyAndSubmit}
                      disabled={submitDisabled || currentActionSubmitted}
                      className={`inline-flex h-9 items-center justify-center rounded-lg px-2 text-xs font-semibold transition ${currentActionSubmitted ? 'cursor-default bg-emerald-600 text-white' : submitDisabled ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06] dark:text-gray-600' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                    >
                      {currentActionSubmitted ? '已提交' : '提交生成'}
                    </button>
                  </div>
                </div>
              </div>
              <div className={mobileActionDock ? 'h-16 sm:hidden' : 'h-[218px] sm:hidden'} aria-hidden="true" />
            </>
          )}
          {hasPlanOptions && (
            <div className={`mb-4 rounded-xl border p-3 transition ${getGuidePanelClass(styleGuideActive, 'muted')}`}>
              {styleGuideActive && (
                <div className={GUIDE_HINT_CLASS}>
                  {guideState.message}
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">视觉风格选择</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    选择内置预设，或编辑后保存到“我的风格”。附图和 A+ 正式生图时会隐藏附加到请求末尾。
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex h-9 rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-semibold dark:border-white/[0.08] dark:bg-gray-900">
                    {STYLE_DENSITY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => changeStyleDensityMode(option.value)}
                        className={`rounded-md px-2.5 transition ${styleDensityMode === option.value ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-950' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {isLoadingStylePreset && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
                  正在加载风格参考图...
                </div>
              )}
              {styleError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
                  {styleError}
                </div>
              )}
              <div className={`mt-3 space-y-4 rounded-xl transition ${getGuideFocusClass(guideState.target === 'style-choice')}`}>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">内置预设</div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {STYLE_PRESETS.map((preset) => {
                      const isSelected = !selectedStyleReference?.customStyleReferenceId && selectedStyleReference?.presetId === preset.id
                      const isLoading = isLoadingStylePreset && selectedStylePresetId === preset.id
                      const assetUrl = getStylePresetAssetUrl(preset)
                      return (
                        <div
                          key={preset.id}
                          onMouseEnter={(event) => updateStylePreview(preset, event)}
                          onMouseMove={(event) => updateStylePreview(preset, event)}
                          onMouseLeave={() => setStylePreview(null)}
                          className={`min-w-0 overflow-hidden rounded-xl border text-left transition ${isSelected ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-500/15 dark:border-violet-300/70 dark:bg-violet-500/10' : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:hover:bg-white/[0.05]'}`}
                        >
                          <button
                            type="button"
                            onClick={() => void selectStylePreset(preset.id)}
                            className="block w-full text-left"
                          >
                            <div className="aspect-square bg-gray-100 dark:bg-white/[0.04]">
                              <img src={assetUrl} alt={preset.label} className="h-full w-full object-cover" />
                            </div>
                            <div className="p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{preset.label}</span>
                                {isSelected && (
                                  <span className="shrink-0 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">已选</span>
                                )}
                                {isLoading && !isSelected && (
                                  <span className="shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">加载中</span>
                                )}
                              </div>
                              <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{preset.description}</div>
                              <div className="mt-2 flex gap-1">
                                {preset.palette.map((color) => (
                                  <span
                                    key={color}
                                    className="h-3 flex-1 rounded-sm border border-black/5 dark:border-white/10"
                                    style={{ backgroundColor: color }}
                                    aria-hidden="true"
                                  />
                                ))}
                              </div>
                            </div>
                          </button>
                          <div className="grid grid-cols-2 gap-1 border-t border-gray-100 p-2 dark:border-white/[0.08]">
                            <button
                              type="button"
                              onClick={() => void openStylePresetPreview(preset.id)}
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
                            >
                              <EyeIcon className="h-3.5 w-3.5" />
                              预览
                            </button>
                            <button
                              type="button"
                              onClick={() => openStyleEditorFromPreset(preset)}
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
                            >
                              <EditIcon className="h-3.5 w-3.5" />
                              编辑
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">我的风格</div>
                    <span className="text-[11px] text-gray-400">{customStyleReferences.length} 套</span>
                  </div>
                  {customStyleReferences.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {customStyleReferences.map((customStyle) => {
                        const meta = getCustomStyleReferenceVisualMeta(customStyle)
                        const isSelected = selectedStyleReference?.customStyleReferenceId === customStyle.id
                        const imageUrl = customStyleImageDataUrls[customStyle.id] || ''
                        return (
                          <div
                            key={customStyle.id}
                            onMouseEnter={(event) => updateCustomStylePreview(customStyle, event)}
                            onMouseMove={(event) => updateCustomStylePreview(customStyle, event)}
                            onMouseLeave={() => setStylePreview(null)}
                            className={`min-w-0 overflow-hidden rounded-xl border text-left transition ${isSelected ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-500/15 dark:border-violet-300/70 dark:bg-violet-500/10' : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:hover:bg-white/[0.05]'}`}
                          >
                            <button
                              type="button"
                              onClick={() => void selectCustomStyleReference(customStyle)}
                              className="block w-full text-left"
                            >
                              <div className="aspect-square bg-gray-100 dark:bg-white/[0.04]">
                                {imageUrl ? (
                                  <img src={imageUrl} alt={meta.label} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-xs text-gray-400">加载中</div>
                                )}
                              </div>
                              <div className="p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="min-w-0 truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{meta.label}</span>
                                  {isSelected && (
                                    <span className="shrink-0 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">已选</span>
                                  )}
                                </div>
                                <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{meta.description}</div>
                                <div className="mt-2 flex gap-1">
                                  {meta.palette.map((color, index) => (
                                    <span
                                      key={`${customStyle.id}-${color}-${index}`}
                                      className="h-3 flex-1 rounded-sm border border-black/5 dark:border-white/10"
                                      style={{ backgroundColor: color }}
                                      aria-hidden="true"
                                    />
                                  ))}
                                </div>
                              </div>
                            </button>
                            <div className="grid grid-cols-3 gap-1 border-t border-gray-100 p-2 dark:border-white/[0.08]">
                              <button
                                type="button"
                                onClick={() => void openCustomStylePreview(customStyle)}
                                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
                              >
                                <EyeIcon className="h-3.5 w-3.5" />
                                预览
                              </button>
                              <button
                                type="button"
                                onClick={() => openStyleEditorFromCustom(customStyle)}
                                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
                              >
                                <EditIcon className="h-3.5 w-3.5" />
                                编辑
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteCustomStyleReference(customStyle)}
                                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold text-red-500 transition hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-400/10 dark:hover:text-red-200"
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                                删除
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 px-3 py-4 text-center text-xs text-gray-500 dark:border-white/[0.12] dark:bg-gray-900/50 dark:text-gray-400">
                      还没有自定义风格。点击内置预设的“编辑”保存到这里。
                    </div>
                  )}
                </div>
              </div>
              {stylePreview && (
                <div
                  className="pointer-events-none fixed z-50 hidden w-[420px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl sm:block dark:border-white/[0.08] dark:bg-gray-950"
                  style={{ left: stylePreview.left, top: stylePreview.top }}
                >
                  <img src={stylePreview.dataUrl} alt="" className="aspect-square w-full bg-gray-100 object-contain dark:bg-white/[0.04]" />
                  <div className="border-t border-gray-100 p-3 dark:border-white/[0.08]">
                    <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{stylePreview.label}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{stylePreview.description}</div>
                  </div>
                </div>
              )}
              {selectedStyleImage?.imageId && selectedStyleLabel && (
                <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-800 dark:border-violet-300/20 dark:bg-violet-400/10 dark:text-violet-200">
                  {isMainListingPlan
                    ? `已选择「${selectedStyleLabel}」，但当前 MAIN 主图不会附加这张风格参考图；切换到附图或 A+ 时才会作为隐藏参考。`
                    : `已选择「${selectedStyleLabel}」。正式生成时会隐藏附加这张风格参考图作为最后一张参考图，用于统一字体感觉、色板、光影、材质和标注样式，不复制其中占位文字、固定版式或产品摆放。`}
                </div>
              )}
              {styleReferenceLimitExceeded && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                  当前产品参考图加隐藏风格参考图共 {effectiveReferenceCount} 张，超过上限 {API_MAX_IMAGES} 张，请删除一张产品参考图后再提交。
                </div>
              )}
            </div>
          )}
          {plannerMode === 'listing' && imagePlans.length > 0 && (
            <div className={`mb-4 rounded-xl border p-3 transition ${getGuidePanelClass(planListGuideActive)}`}>
              {planListGuideActive && (
                <div className={GUIDE_HINT_CLASS}>
                  {guideState.message}
                </div>
              )}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">逐张策划</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    选择图片位后，Prompt Preview 和生成按钮会切换到对应提示词。
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                  {imagePlans.length} 张
                </span>
              </div>
              <div className={PLAN_LIST_CLASS}>
                {imagePlans.map((plan, index) => {
                  const isSelected = selectedPlanIndex === index
                  const planActionProgress = actionProgress[getPlannerActionKey('listing', index, plan.slot)]
                  return (
                    <button
                      key={`${plan.slot}-${index}`}
                      type="button"
                      onClick={() => selectPlan(index)}
                      className={`rounded-xl border p-3 text-left transition ${isSelected ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-500/15 dark:border-blue-400/70 dark:bg-blue-500/10' : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950 dark:hover:bg-white/[0.05]'}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300'}`}>
                          {plan.slot}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{plan.label}</span>
                        {isSelected && (
                          <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">当前</span>
                        )}
                        {planActionProgress && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${planActionProgress === 'submitted' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'}`}>
                            {planActionProgress === 'submitted' ? '已提交' : '已填入'}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{getPlanSummary(plan.planMarkdown)}</div>
                      <div className="mt-2 line-clamp-2 rounded-lg bg-white/70 px-2 py-1 text-[11px] leading-relaxed text-gray-500 dark:bg-white/[0.05] dark:text-gray-300">
                        Negative：{plan.negativePrompt || '未提供'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {plannerMode === 'aplus' && aPlusPlansWithSizes.length > 0 && (
            <div className={`mb-4 rounded-xl border p-3 transition ${getGuidePanelClass(planListGuideActive)}`}>
              {planListGuideActive && (
                <div className={GUIDE_HINT_CLASS}>
                  {guideState.message}
                </div>
              )}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">A+ 模块编排</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    选择模块后，Prompt Preview 和生成按钮会切换到对应 A+ 提示词与尺寸。
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                  {aPlusPlansWithSizes.length} 张
                </span>
              </div>
              <div className={PLAN_LIST_CLASS}>
                {aPlusPlansWithSizes.map((plan, index) => {
                  const isSelected = selectedAPlusPlanIndex === index
                  const externalText = formatAPlusModuleText(plan)
                  const planActionProgress = actionProgress[getPlannerActionKey('aplus', index, plan.slot)]
                  return (
                    <button
                      key={`${plan.slot}-${index}`}
                      type="button"
                      onClick={() => selectAPlusPlan(index)}
                      className={`rounded-xl border p-3 text-left transition ${isSelected ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-500/15 dark:border-blue-400/70 dark:bg-blue-500/10' : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950 dark:hover:bg-white/[0.05]'}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300'}`}>
                          {plan.slot}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{getAPlusModuleDisplayName(plan)}</span>
                        <span className="text-xs text-gray-400">{getAPlusModuleEnglishName(plan)}</span>
                        {isSelected && (
                          <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">当前</span>
                        )}
                        {planActionProgress && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${planActionProgress === 'submitted' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'}`}>
                            {planActionProgress === 'submitted' ? '已提交' : '已填入'}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="rounded-md bg-white/70 px-2 py-0.5 dark:bg-white/[0.05]">上传 {plan.uploadSize}</span>
                        <span className="rounded-md bg-white/70 px-2 py-0.5 dark:bg-white/[0.05]">生成 {plan.generationSize}</span>
                      </div>
                      <div className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{getPlanSummary(plan.planMarkdown)}</div>
                      {(isAPlusTextModule(plan) || externalText) && externalText && (
                        <div className="mt-2 rounded-lg bg-white/70 px-2 py-1 text-xs leading-relaxed text-gray-700 dark:bg-white/[0.05] dark:text-gray-200">
                          {plan.textTitle && <div className="font-semibold">{plan.textTitle}</div>}
                          {plan.textBody && <div className="mt-0.5 line-clamp-2 text-gray-500 dark:text-gray-300">{plan.textBody}</div>}
                        </div>
                      )}
                      <div className="mt-2 line-clamp-2 rounded-lg bg-white/70 px-2 py-1 text-[11px] leading-relaxed text-gray-500 dark:bg-white/[0.05] dark:text-gray-300">
                        Negative：{plan.negativePrompt || '未提供'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {plannerMode === 'aplus' && aPlusPlansWithSizes.length === 0 && (
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">A+ 模块编排</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    当前选择 {getAPlusContentTypeLabel(aPlusType)}，可先调整模块数量，再点击 AI策划A+。
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={restoreDefaultAPlusModules}
                    disabled={isPlanning || aPlusSpecsAreDefault}
                    title="恢复当前 A+ 类型默认模块"
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition ${!isPlanning && !aPlusSpecsAreDefault ? 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white' : 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 dark:border-white/[0.04] dark:bg-white/[0.04] dark:text-gray-600'}`}
                  >
                    <RefreshIcon className="h-3.5 w-3.5" />
                    恢复默认
                  </button>
                  <span className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                    {aPlusSpecs.length} 张
                  </span>
                </div>
              </div>
              <div className={PLAN_LIST_CLASS}>
                {aPlusSpecs.map((spec, index) => (
                  <div key={spec.slot} className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-gray-900">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                            {spec.slot}
                          </span>
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{getAPlusModuleDisplayName(spec)}</span>
                          <span className="text-xs text-gray-400">{getAPlusModuleEnglishName(spec)}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                          上传 {getAPlusModuleUploadSize(spec)} · 生成 {getAPlusModuleGenerationSize(spec, resolutionTier)}
                          {isAPlusTextModule(spec) ? ' · 含标题/正文' : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => addAPlusModuleAfter(index)}
                          disabled={isPlanning || aPlusSpecs.length >= MAX_A_PLUS_MODULE_COUNT}
                          aria-label={`在 ${spec.slot} 后添加同尺寸 A+ 模块`}
                          title={aPlusSpecs.length >= MAX_A_PLUS_MODULE_COUNT ? `最多 ${MAX_A_PLUS_MODULE_COUNT} 张` : '添加同尺寸模块'}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${!isPlanning && aPlusSpecs.length < MAX_A_PLUS_MODULE_COUNT ? 'border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200 dark:hover:bg-blue-400/20' : 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 dark:border-white/[0.04] dark:bg-white/[0.04] dark:text-gray-600'}`}
                        >
                          <PlusIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAPlusModuleAt(index)}
                          disabled={isPlanning || aPlusSpecs.length <= MIN_A_PLUS_MODULE_COUNT}
                          aria-label={`删除 ${spec.slot} A+ 模块`}
                          title={aPlusSpecs.length <= MIN_A_PLUS_MODULE_COUNT ? `至少保留 ${MIN_A_PLUS_MODULE_COUNT} 张` : '删除模块'}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${!isPlanning && aPlusSpecs.length > MIN_A_PLUS_MODULE_COUNT ? 'border-red-100 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200 dark:hover:bg-red-400/20' : 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 dark:border-white/[0.04] dark:bg-white/[0.04] dark:text-gray-600'}`}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {checks.map((check) => (
              <div
                key={check.label}
                className={`rounded-xl border px-3 py-2 ${check.status === 'ready' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200' : check.status === 'missing' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200'}`}
              >
                <div className="text-xs font-semibold">{check.label}</div>
                <div className="mt-0.5 text-[11px] opacity-80">{check.detail}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Prompt Preview{plannerMode === 'aplus' && selectedAPlusPlan ? ` · ${selectedAPlusPlan.slot}` : selectedPlan ? ` · ${selectedPlan.slot}` : ''}
              </span>
              <span className="text-xs text-gray-400">{targetSize} / {generationParamLabel}</span>
            </div>
            <textarea
              value={plannerMode === 'aplus' && !selectedAPlusPlan
                ? '请先点击 AI策划A+，再在右侧选择一个 A+ 模块。'
                : activePlanPreview || '请先粘贴 Listing 并点击 AI策划，LLM 会生成中文策划、英文 Prompt 和 Negative Prompt。'}
              className="h-[430px] w-full resize-none rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs leading-relaxed text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200"
              spellCheck={false}
              readOnly
            />
          </div>
          {plannerMode === 'aplus' && selectedAPlusPlan && (
            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  A+ 文案 · {selectedAPlusPlan.slot}
                </span>
                <button
                  type="button"
                  onClick={copyAPlusText}
                  disabled={!selectedAPlusText.trim()}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition ${selectedAPlusText.trim() ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]' : 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 dark:border-white/[0.04] dark:bg-white/[0.04] dark:text-gray-600'}`}
                >
                  <CopyIcon className="h-3.5 w-3.5" />
                  复制文案
                </button>
              </div>
              <textarea
                value={selectedAPlusText || (isAPlusTextModule(selectedAPlusPlan) ? '该模块暂未生成标题/正文文案。' : '当前模块通常不需要外部标题/正文文案。')}
                className="h-28 w-full resize-none rounded-lg border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200"
                spellCheck={false}
                readOnly
              />
              <div className="mt-2 text-[11px] text-gray-400">
                外部 A+ 文案用于亚马逊模块文本区，不会写入图片生成 Prompt。
              </div>
            </div>
          )}
          {activePrompt.trim() && prompt.trim() && prompt !== activePrompt && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
              底部输入框已有内容，点击“填入”会用当前亚马逊提示词覆盖。
            </div>
          )}
        </div>
      </div>
    </section>
    </>
  )
}
