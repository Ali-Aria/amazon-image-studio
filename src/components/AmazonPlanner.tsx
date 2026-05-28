import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { addImageFromFile, ensureImageCached, submitTask, useStore } from '../store'
import { getActiveApiProfile, getAmazonPlannerProfile, normalizeSettings, validateApiProfile } from '../lib/apiProfiles'
import {
  DEFAULT_AMAZON_PROMPT_DRAFT,
  type AmazonPromptDraft,
} from '../lib/amazonPrompt'
import {
  buildAmazonAPlusPlanPrompt,
  buildAmazonPlanPrompt,
  buildAmazonStyleCandidatePrompt,
  formatAPlusModuleText,
  getAPlusContentTypeLabel,
  getAPlusModuleDisplayName,
  getAPlusModuleEnglishName,
  getAPlusModuleGenerationSize,
  getAPlusModuleSpecs,
  getAPlusModuleUploadSize,
  isAPlusTextModule,
  withAPlusGenerationSizes,
  type APlusContentType,
  type AmazonAPlusPlan,
  type AmazonImagePlan,
  type AmazonPlannerMode,
  type AmazonStyleCandidate,
} from '../lib/listingPlanner'
import { callAmazonPlannerApi, type PlannerApiResult } from '../lib/listingPlannerApi'
import { callImageApi } from '../lib/api'
import { deleteAmazonPlannerSession, getAllAmazonPlannerSessions, putAmazonPlannerSession, storeImage } from '../lib/db'
import { normalizeParamsForSettings } from '../lib/paramCompatibility'
import { DEFAULT_PARAMS } from '../types'
import type { AmazonPlannerSession } from '../types'
import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, HistoryIcon, PhotoIcon, PlusIcon, TrashIcon } from './icons'

const FIELD_CLASS = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500'
const LABEL_CLASS = 'mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400'
const PLAN_LIST_CLASS = 'grid max-h-[420px] gap-2 overflow-y-auto overscroll-contain pr-1 custom-scrollbar sm:max-h-[480px]'
const API_MAX_IMAGES = 16
type ComplianceStatus = 'ready' | 'warning' | 'missing'
type WorkflowStepStatus = 'done' | 'current' | 'todo'
type StyleImageState = {
  candidateIndex: number
  status: 'running' | 'done' | 'error'
  imageId?: string
  dataUrl?: string
  error?: string
}
const PLANNER_HISTORY_LIMIT = 30

function createPlannerSessionId() {
  return `amazon-planner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeHistoryTitle(value: string) {
  const chars = Array.from(value.replace(/\s+/g, ' ').trim())
  if (chars.length <= 40) return chars.join('')
  return `${chars.slice(0, 37).join('')}...`
}

function getPlannerSessionTitle(draft: AmazonPromptDraft, listingText: string) {
  return normalizeHistoryTitle(draft.productTitle) || normalizeHistoryTitle(listingText) || '未命名策划'
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

function getSessionStyleImages(styleImages: StyleImageState[]): AmazonPlannerSession['styleImages'] {
  return styleImages
    .filter((image): image is StyleImageState & { imageId: string } => image.status === 'done' && Boolean(image.imageId))
    .map((image) => ({ candidateIndex: image.candidateIndex, imageId: image.imageId }))
}

function sortPlannerSessions(sessions: AmazonPlannerSession[]) {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, PLANNER_HISTORY_LIMIT)
}

function getWorkflowStepClass(status: WorkflowStepStatus) {
  if (status === 'done') return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200'
  if (status === 'current') return 'border-blue-200 bg-blue-50 text-blue-800 ring-2 ring-blue-500/10 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200'
  return 'border-gray-200 bg-white text-gray-500 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-400'
}

function getWorkflowIndexClass(status: WorkflowStepStatus) {
  if (status === 'done') return 'bg-emerald-600 text-white dark:bg-emerald-400 dark:text-gray-950'
  if (status === 'current') return 'bg-blue-600 text-white'
  return 'bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-300'
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
      label: '风格板',
      status: hasStyleReference ? 'ready' : 'warning',
      detail: hasStyleReference ? '已选择隐藏风格参考' : '正式生成前请选择风格',
    },
  ]
}

function getAmazonListingPlannerChecks(
  draft: AmazonPromptDraft,
  size: string,
  referenceImageCount: number,
  hasStyleReference: boolean,
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
      label: '风格板',
      status: hasStyleReference ? 'ready' : 'warning',
      detail: hasStyleReference ? '已选择隐藏风格参考' : '正式生成前请选择风格',
    },
  ]
}

export default function AmazonPlanner() {
  const prompt = useStore((s) => s.prompt)
  const params = useStore((s) => s.params)
  const inputImages = useStore((s) => s.inputImages)
  const settings = useStore((s) => s.settings)
  const setPrompt = useStore((s) => s.setPrompt)
  const setParams = useStore((s) => s.setParams)
  const setPendingTaskCategory = useStore((s) => s.setPendingTaskCategory)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const removeInputImage = useStore((s) => s.removeInputImage)
  const clearInputImages = useStore((s) => s.clearInputImages)
  const setInputImages = useStore((s) => s.setInputImages)
  const showToast = useStore((s) => s.showToast)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<AmazonPromptDraft>(DEFAULT_AMAZON_PROMPT_DRAFT)
  const [resolution, setResolution] = useState<'2k' | '4k'>('2k')
  const [plannerMode, setPlannerMode] = useState<AmazonPlannerMode>('listing')
  const [aPlusType, setAPlusType] = useState<APlusContentType>('standard-large')
  const [listingText, setListingText] = useState('')
  const [imagePlans, setImagePlans] = useState<AmazonImagePlan[]>([])
  const [aPlusPlans, setAPlusPlans] = useState<AmazonAPlusPlan[]>([])
  const [seriesStyleGuides, setSeriesStyleGuides] = useState<{ listing: string; aplus: string }>({
    listing: '',
    aplus: '',
  })
  const [styleCandidates, setStyleCandidates] = useState<AmazonStyleCandidate[]>([])
  const [styleImages, setStyleImages] = useState<StyleImageState[]>([])
  const [selectedStyleIndex, setSelectedStyleIndex] = useState<number | null>(null)
  const [isGeneratingStyleImages, setIsGeneratingStyleImages] = useState(false)
  const [styleError, setStyleError] = useState('')
  const [selectedPlanIndex, setSelectedPlanIndex] = useState<number | null>(null)
  const [selectedAPlusPlanIndex, setSelectedAPlusPlanIndex] = useState<number | null>(null)
  const [plannerSessions, setPlannerSessions] = useState<AmazonPlannerSession[]>([])
  const [currentPlannerSessionId, setCurrentPlannerSessionId] = useState<string | null>(null)
  const [showPlannerHistory, setShowPlannerHistory] = useState(false)
  const [isPlanning, setIsPlanning] = useState(false)
  const [plannerError, setPlannerError] = useState('')
  const resolutionTier = resolution === '4k' ? '4K' : '2K'
  const aPlusSpecs = useMemo(() => getAPlusModuleSpecs(aPlusType), [aPlusType])
  const aPlusPlansWithSizes = useMemo(() => withAPlusGenerationSizes(aPlusPlans, resolutionTier), [aPlusPlans, resolutionTier])
  const selectedPlan = selectedPlanIndex == null ? null : imagePlans[selectedPlanIndex] ?? null
  const selectedAPlusPlan = selectedAPlusPlanIndex == null ? null : aPlusPlansWithSizes[selectedAPlusPlanIndex] ?? null
  const selectedAPlusText = selectedAPlusPlan ? formatAPlusModuleText(selectedAPlusPlan) : ''
  const selectedStyleImage = selectedStyleIndex == null ? null : styleImages.find((image) => image.candidateIndex === selectedStyleIndex && image.status === 'done') ?? null
  const selectedStyleCandidate = selectedStyleIndex == null ? null : styleCandidates[selectedStyleIndex] ?? null
  const activeSeriesStyleGuide = plannerMode === 'aplus' ? seriesStyleGuides.aplus : seriesStyleGuides.listing
  const hasStyleReference = Boolean(selectedStyleImage?.imageId)
  const effectiveReferenceCount = inputImages.length + (selectedStyleImage?.imageId && !inputImages.some((image) => image.id === selectedStyleImage.imageId) ? 1 : 0)
  const styleReferenceLimitExceeded = effectiveReferenceCount > API_MAX_IMAGES
  const activePrompt = plannerMode === 'aplus'
    ? selectedAPlusPlan ? buildAmazonAPlusPlanPrompt({ ...selectedAPlusPlan, seriesStyleGuide: activeSeriesStyleGuide, styleReferenceAttached: hasStyleReference }) : ''
    : selectedPlan ? buildAmazonPlanPrompt({ ...selectedPlan, seriesStyleGuide: activeSeriesStyleGuide, styleReferenceAttached: hasStyleReference }) : ''
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
  const listingTargetSize = resolution === '4k' ? '4096x4096' : '2048x2048'
  const targetSize = plannerMode === 'aplus' && selectedAPlusPlan ? selectedAPlusPlan.generationSize : listingTargetSize
  const generationParamLabel = `${DEFAULT_PARAMS.output_format.toUpperCase()} / ${DEFAULT_PARAMS.quality} / 压缩率${DEFAULT_PARAMS.output_compression}`
  const visiblePlanCount = plannerMode === 'aplus' ? aPlusPlansWithSizes.length : imagePlans.length
  const visiblePlanIndex = plannerMode === 'aplus' ? selectedAPlusPlanIndex : selectedPlanIndex
  const actionSlot = plannerMode === 'aplus' ? selectedAPlusPlan?.slot : selectedPlan?.slot
  const actionLabel = plannerMode === 'aplus' ? selectedAPlusPlan?.label : selectedPlan?.label
  const showStickyActions = plannerMode === 'aplus' ? aPlusPlansWithSizes.length > 0 : imagePlans.length > 0
  const actionDisabled = plannerMode === 'aplus' ? !selectedAPlusPlan : !activePrompt.trim()
  const submitDisabled = actionDisabled || !hasStyleReference || styleReferenceLimitExceeded
  const canGoPrev = visiblePlanCount > 0 && visiblePlanIndex != null && visiblePlanIndex > 0
  const canGoNext = visiblePlanCount > 0 && visiblePlanIndex != null && visiblePlanIndex < visiblePlanCount - 1
  const actionPositionLabel = visiblePlanCount > 0 && visiblePlanIndex != null
    ? `${visiblePlanIndex + 1}/${visiblePlanCount}`
    : plannerMode === 'aplus'
      ? `${aPlusSpecs.length} 个待策划模块`
      : '未选择'
  const checks = plannerMode === 'aplus'
    ? getAmazonAPlusComplianceChecks(draft, selectedAPlusPlan, aPlusType, inputImages.length, hasStyleReference)
    : getAmazonListingPlannerChecks(draft, targetSize, inputImages.length, hasStyleReference)
  const atImageLimit = inputImages.length >= API_MAX_IMAGES
  const hasPlanningInput = Boolean(listingText.trim() || draft.productTitle.trim() || draft.sellingPoints.trim() || inputImages.length > 0)
  const hasPlanOptions = visiblePlanCount > 0
  const hasSelectedPlan = plannerMode === 'aplus' ? Boolean(selectedAPlusPlan) : Boolean(selectedPlan)
  const activeWorkflowStep = !hasPlanningInput ? 0 : !hasPlanOptions ? 1 : !hasStyleReference ? 2 : !hasSelectedPlan ? 3 : 4
  const workflowSteps = [
    {
      label: '准备资料',
      detail: hasPlanningInput ? '资料已就绪' : plannerMode === 'aplus' ? '标题、五点或品牌说明' : '标题和五点描述',
    },
    {
      label: plannerMode === 'aplus' ? 'AI策划A+' : 'AI策划',
      detail: hasPlanOptions
        ? plannerMode === 'aplus' ? `${visiblePlanCount} 个模块` : `${visiblePlanCount} 张方案`
        : plannerProfileValidation ? '先完成策划配置' : '生成逐张方案',
    },
    {
      label: '选择风格',
      detail: hasStyleReference
        ? `${selectedStyleCandidate?.label ?? '已选择'} · 隐藏参考`
        : styleImages.some((image) => image.status === 'done')
          ? '请选择一张风格板'
          : '生成 3 张低清风格板',
    },
    {
      label: plannerMode === 'aplus' ? '选择模块' : '选择图片位',
      detail: hasSelectedPlan ? `${actionSlot ?? '当前'} 已选` : hasPlanOptions ? '点选右侧卡片' : '等待策划结果',
    },
    {
      label: '填入生成',
      detail: hasSelectedPlan ? `${targetSize} / ${generationParamLabel}` : '等待可用 Prompt',
    },
  ].map((step, index) => ({
    ...step,
    status: index < activeWorkflowStep ? 'done' : index === activeWorkflowStep ? 'current' : 'todo',
  })) satisfies Array<{ label: string; detail: string; status: WorkflowStepStatus }>

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

  const upsertPlannerSessionList = (session: AmazonPlannerSession) => {
    setPlannerSessions((current) => sortPlannerSessions([
      session,
      ...current.filter((item) => item.id !== session.id),
    ]))
  }

  const createPlannerSessionSnapshot = (overrides: Partial<AmazonPlannerSession> = {}): AmazonPlannerSession => {
    const now = Date.now()
    const existing = !overrides.id && currentPlannerSessionId ? plannerSessions.find((session) => session.id === currentPlannerSessionId) : null
    const snapshotDraft = overrides.draft ? fromSessionDraft(overrides.draft) : draft
    const snapshotListingText = overrides.listingText ?? listingText
    return {
      id: overrides.id ?? currentPlannerSessionId ?? createPlannerSessionId(),
      title: overrides.title ?? getPlannerSessionTitle(snapshotDraft, snapshotListingText),
      mode: overrides.mode ?? plannerMode,
      aPlusType: overrides.aPlusType ?? aPlusType,
      resolution: overrides.resolution ?? resolution,
      listingText: snapshotListingText,
      referenceImageIds: overrides.referenceImageIds ?? inputImages.map((image) => image.id),
      draft: overrides.draft ?? toSessionDraft(draft),
      seriesStyleGuides: overrides.seriesStyleGuides ?? seriesStyleGuides,
      styleCandidates: overrides.styleCandidates ?? styleCandidates,
      styleImages: overrides.styleImages ?? getSessionStyleImages(styleImages),
      selectedStyleIndex: overrides.selectedStyleIndex ?? selectedStyleIndex,
      imagePlans: overrides.imagePlans ?? imagePlans,
      aPlusPlans: overrides.aPlusPlans ?? aPlusPlansWithSizes,
      selectedPlanIndex: overrides.selectedPlanIndex ?? selectedPlanIndex,
      selectedAPlusPlanIndex: overrides.selectedAPlusPlanIndex ?? selectedAPlusPlanIndex,
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

  const applyPrompt = (options: { requireStyle?: boolean } = {}) => {
    if (plannerMode === 'aplus' && !selectedAPlusPlan) {
      showToast('请先 AI 策划并选择一个 A+ 模块', 'error')
      return false
    }
    if (!activePrompt.trim()) {
      showToast(plannerMode === 'aplus' ? '请先 AI 策划并选择一个 A+ 模块' : '请先 AI 策划并选择一个图片位', 'error')
      return false
    }
    if (options.requireStyle && !selectedStyleImage?.imageId) {
      showToast('请先生成并选择一张风格参考板', 'error')
      return false
    }
    if (options.requireStyle && styleReferenceLimitExceeded) {
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
        ...(selectedStyleImage?.imageId ? { styleReferenceImageId: selectedStyleImage.imageId } : {}),
      },
    })
    setParams({
      size: targetSize,
      quality: DEFAULT_PARAMS.quality,
      output_format: DEFAULT_PARAMS.output_format,
      output_compression: DEFAULT_PARAMS.output_compression,
      n: 1,
    })
    showToast(plannerMode === 'aplus' ? '已填入 A+ 图片提示词' : '已填入亚马逊图片提示词', 'success')
    return true
  }

  const applyAndSubmit = () => {
    if (!applyPrompt({ requireStyle: true })) return
    queueMicrotask(() => {
      void submitTask()
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

  const generateStyleImages = async () => {
    if (!styleCandidates.length) {
      showToast('请先完成 AI 策划，再生成风格板', 'error')
      return
    }

    const normalizedSettings = normalizeSettings(settings)
    const imageProfile = getActiveApiProfile(normalizedSettings)
    const imageProfileValidation = validateApiProfile(imageProfile)
    if (imageProfileValidation) {
      showToast(`请先完善生图 API 配置：${imageProfileValidation}`, 'error')
      setShowSettings(true, 'api')
      return
    }
    if (imageProfile.apiMode === 'chat') {
      showToast('风格板需要使用 Images API 或 Responses API 生图配置，不能使用 Chat Completions 策划配置。', 'error')
      setShowSettings(true, 'api')
      return
    }

    setIsGeneratingStyleImages(true)
    setStyleError('')
    setSelectedStyleIndex(null)
    setStyleImages(styleCandidates.map((_, index) => ({ candidateIndex: index, status: 'running' })))

    const styleParams = normalizeParamsForSettings({
      size: '1024x1024',
      quality: DEFAULT_PARAMS.quality,
      output_format: DEFAULT_PARAMS.output_format,
      output_compression: DEFAULT_PARAMS.output_compression,
      moderation: params.moderation,
      n: 1,
    }, normalizedSettings, { hasInputImages: inputImages.length > 0 })
    const referenceImages = inputImages.map((image) => image.dataUrl)

    const settled = await Promise.allSettled(styleCandidates.map(async (candidate, candidateIndex) => {
      const result = await callImageApi({
        settings: normalizedSettings,
        prompt: buildAmazonStyleCandidatePrompt(candidate, activeSeriesStyleGuide),
        params: styleParams,
        inputImageDataUrls: referenceImages,
      })
      const dataUrl = result.images[0]
      if (!dataUrl) throw new Error('风格板接口没有返回图片')
      const imageId = await storeImage(dataUrl, 'generated')
      return { candidateIndex, imageId, dataUrl }
    }))

    const nextStyleImages: StyleImageState[] = settled.map((result, index) => {
      if (result.status === 'fulfilled') {
        return {
          candidateIndex: result.value.candidateIndex,
          status: 'done',
          imageId: result.value.imageId,
          dataUrl: result.value.dataUrl,
        }
      }
      return {
        candidateIndex: index,
        status: 'error',
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      }
    })
    setStyleImages(nextStyleImages)
    setIsGeneratingStyleImages(false)

    const failed = nextStyleImages.filter((image) => image.status === 'error')
    updateCurrentPlannerSession({
      styleImages: getSessionStyleImages(nextStyleImages),
      selectedStyleIndex: null,
    })
    if (failed.length === styleCandidates.length) {
      const message = failed[0]?.error || '风格板生成失败'
      setStyleError(message)
      showToast('风格板生成失败，请查看详情', 'error')
      return
    }
    if (failed.length > 0) {
      setStyleError(`${failed.length} 张风格板生成失败，可先选择已成功的风格板。`)
      showToast('部分风格板生成失败', 'error')
      return
    }
    showToast('风格板已生成，请选择一个视觉风格', 'success')
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
    setStyleCandidates(result.styleCandidates)
    setStyleImages([])
    setSelectedStyleIndex(null)
    setStyleError('')
    setPlannerError('')
    void savePlannerSession({
      id: createPlannerSessionId(),
      mode: result.mode,
      draft: toSessionDraft(nextDraft),
      seriesStyleGuides: nextSeriesStyleGuides,
      styleCandidates: result.styleCandidates,
      styleImages: [],
      selectedStyleIndex: null,
      imagePlans: nextImagePlans,
      aPlusPlans: nextAPlusPlans,
      selectedPlanIndex: nextSelectedPlanIndex,
      selectedAPlusPlanIndex: nextSelectedAPlusPlanIndex,
    }).catch((err) => {
      showToast(`策划历史保存失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    })
    showToast(`${sourceLabel}已生成 ${result.mode === 'aplus' ? result.aPlusPlans.length : result.plans.length} 张图片策划`, 'success')
  }

  const createAiPlan = async () => {
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

    setIsPlanning(true)
    setPlannerError('')
    try {
      applyPlannerResult(
        await callAmazonPlannerApi({
          listingText,
          baseDraft: draft,
          profile: plannerProfile,
          referenceImageDataUrls: inputImages.map((image) => image.dataUrl),
          mode: plannerMode,
          aPlusType,
          aPlusGenerationTier: resolutionTier,
        }),
        plannerMode === 'aplus' ? 'A+ AI 策划' : 'AI 策划',
      )
    } catch (err) {
      setPlannerError(getPlannerFailureDetail(err))
      showToast('AI 策划失败，请查看详情', 'error')
    } finally {
      setIsPlanning(false)
    }
  }

  const selectStyleCandidate = (index: number) => {
    const imageState = styleImages.find((image) => image.candidateIndex === index && image.status === 'done' && image.imageId)
    if (!imageState) return
    setSelectedStyleIndex(index)
    updateCurrentPlannerSession({
      selectedStyleIndex: index,
      styleImages: getSessionStyleImages(styleImages),
    })
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
    setStyleCandidates([])
    setStyleImages([])
    setSelectedStyleIndex(null)
    setStyleError('')
  }

  const changeAPlusType = (nextType: APlusContentType) => {
    setAPlusType(nextType)
    if (nextType !== aPlusType) {
      setAPlusPlans([])
      setSelectedAPlusPlanIndex(null)
      setSeriesStyleGuides((current) => ({ ...current, aplus: '' }))
      setStyleCandidates([])
      setStyleImages([])
      setSelectedStyleIndex(null)
      setStyleError('')
    }
  }

  const clearListingPlan = () => {
    setListingText('')
    setImagePlans([])
    setAPlusPlans([])
    setSeriesStyleGuides({ listing: '', aplus: '' })
    setStyleCandidates([])
    setStyleImages([])
    setSelectedStyleIndex(null)
    setStyleError('')
    setSelectedPlanIndex(null)
    setSelectedAPlusPlanIndex(null)
    setPlannerError('')
    setCurrentPlannerSessionId(null)
  }

  const restorePlannerSession = async (session: AmazonPlannerSession) => {
    const restoredReferences = []
    for (const imageId of session.referenceImageIds) {
      const dataUrl = await ensureImageCached(imageId)
      if (dataUrl) restoredReferences.push({ id: imageId, dataUrl })
    }

    const restoredStyleImages: StyleImageState[] = []
    for (const image of session.styleImages) {
      const dataUrl = await ensureImageCached(image.imageId)
      if (dataUrl) {
        restoredStyleImages.push({
          candidateIndex: image.candidateIndex,
          status: 'done',
          imageId: image.imageId,
          dataUrl,
        })
      }
    }

    const selectedStyleRestored = session.selectedStyleIndex != null &&
      restoredStyleImages.some((image) => image.candidateIndex === session.selectedStyleIndex)

    setPlannerMode(session.mode)
    setAPlusType(session.aPlusType)
    setResolution(session.resolution)
    setListingText(session.listingText)
    setInputImages(restoredReferences)
    setDraft(fromSessionDraft(session.draft))
    setSeriesStyleGuides(session.seriesStyleGuides)
    setStyleCandidates(session.styleCandidates)
    setStyleImages(restoredStyleImages)
    setSelectedStyleIndex(selectedStyleRestored ? session.selectedStyleIndex : null)
    setImagePlans(session.imagePlans as AmazonImagePlan[])
    setAPlusPlans(session.aPlusPlans as AmazonAPlusPlan[])
    setSelectedPlanIndex(session.selectedPlanIndex != null && session.imagePlans[session.selectedPlanIndex] ? session.selectedPlanIndex : null)
    setSelectedAPlusPlanIndex(session.selectedAPlusPlanIndex != null && session.aPlusPlans[session.selectedAPlusPlanIndex] ? session.selectedAPlusPlanIndex : null)
    setPlannerError('')
    setStyleError(session.selectedStyleIndex != null && !selectedStyleRestored
      ? '历史中的风格板图片不存在，请重新生成并选择风格板。策划文本已恢复。'
      : '')
    setCurrentPlannerSessionId(session.id)
    setShowPlannerHistory(false)
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
    <section data-no-drag-select className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-4 dark:border-white/[0.08] sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50">亚马逊图片工作室</h2>
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
            <button
              type="button"
              onClick={copyPrompt}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-white/[0.06]"
            >
              <CopyIcon className="h-4 w-4" />
              复制
            </button>
            <button
              type="button"
              onClick={() => applyPrompt()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-gray-700 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
            >
              <PhotoIcon className="h-4 w-4" />
              填入
            </button>
            <button
              type="button"
              onClick={applyAndSubmit}
              className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              提交生成
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Amazon 图片生成流程">
          {workflowSteps.map((step, index) => (
            <div
              key={step.label}
              aria-current={step.status === 'current' ? 'step' : undefined}
              className={`min-h-[68px] rounded-lg border px-3 py-2.5 transition ${getWorkflowStepClass(step.status)}`}
            >
              <div className="flex items-center gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${getWorkflowIndexClass(step.status)}`}>
                  {index + 1}
                </span>
                <span className="min-w-0 text-sm font-semibold">{step.label}</span>
              </div>
              <div className="mt-1.5 text-xs leading-snug opacity-80">{step.detail}</div>
            </div>
          ))}
        </div>
        {showPlannerHistory && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">策划历史</div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  保存在当前浏览器中，恢复后会带回 Listing、策划卡片、风格候选和已选风格板。
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
                          <span>{session.mode === 'aplus' ? session.aPlusType : `${session.imagePlans.length} 张`}</span>
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
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-white/[0.08] dark:bg-gray-950">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {plannerMode === 'aplus' ? 'A+ 图片策划' : 'Listing 智能策划'}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {plannerMode === 'aplus'
                    ? '粘贴标题、五点描述或品牌说明，生成 Standard / 大图版 / Premium A+ 模块编排和英文提示词。'
                    : '粘贴标题、五点描述或产品说明，生成 Main + PT01-PT06 的逐张方案和英文提示词。'}
                </div>
              </div>
              <div className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                双配置
              </div>
            </div>
            {plannerMode === 'aplus' && (
              <div className="mt-3 inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
                {([
                  ['standard-large', '大图版'],
                  ['standard', 'Standard'],
                  ['premium', 'Premium'],
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
            <label className="mt-3 block">
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
              <div className={`rounded-xl border px-3 py-2 ${plannerProfile && !plannerProfileValidation ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200'}`}>
                <div className="text-xs font-semibold">AI 策划配置</div>
                <div className="mt-1 text-xs leading-relaxed">
                  {plannerProfile ? `${plannerProfile.name} · ${plannerProfile.model} · ${plannerApiLabel}` : '未配置，请在设置中选择一个 Chat Completions 策划配置'}
                  {plannerProfileValidation ? `（${plannerProfileValidation}）` : ''}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={createAiPlan}
                  disabled={isPlanning || Boolean(plannerProfileValidation)}
                  className={`inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-white transition ${isPlanning ? 'cursor-wait bg-gray-400' : plannerProfileValidation ? 'cursor-not-allowed bg-gray-300 dark:bg-white/[0.12]' : 'bg-blue-600 hover:bg-blue-500'}`}
                >
                  {isPlanning ? '策划中...' : plannerMode === 'aplus' ? 'AI策划A+' : 'AI策划'}
                </button>
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
              生图使用当前图像生成配置；AI策划使用设置中单独指定的 Chat/Responses 文本配置，不需要来回切换接口类型。
            </div>
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
                    ? `${inputImages.length}/${API_MAX_IMAGES} 张产品参考图${hasStyleReference ? `；正式生成时另附 1 张隐藏风格板（实际 ${effectiveReferenceCount}/${API_MAX_IMAGES}）` : '，将随生成请求一起发送'}`
                    : hasStyleReference
                      ? `未上传产品参考图；正式生成时会附 1 张隐藏风格板`
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
                placeholder="主图建议留空；附图填写真实场景"
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
              <div data-amazon-action-bar className="fixed left-3 right-3 top-[7.25rem] z-30 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg shadow-gray-900/5 backdrop-blur dark:border-white/[0.08] dark:bg-gray-950/95 dark:shadow-black/20 sm:sticky sm:left-auto sm:right-auto sm:top-20 sm:mb-4">
              <div className="flex flex-col gap-3">
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
                      className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition ${canGoNext ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]' : 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 dark:border-white/[0.04] dark:bg-white/[0.04] dark:text-gray-600'}`}
                    >
                      下一张
                      <ChevronRightIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
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
                    className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition ${actionDisabled ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06] dark:text-gray-600' : 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200'}`}
                  >
                    <PhotoIcon className="h-3.5 w-3.5" />
                    填入
                  </button>
                  <button
                    type="button"
                    onClick={applyAndSubmit}
                    disabled={submitDisabled}
                    className={`inline-flex h-9 items-center justify-center rounded-lg px-2 text-xs font-semibold transition ${submitDisabled ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06] dark:text-gray-600' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                  >
                    提交生成
                  </button>
                </div>
              </div>
              </div>
              <div className="h-[148px] sm:hidden" aria-hidden="true" />
            </>
          )}
          {hasPlanOptions && (
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">视觉风格选择</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    先生成 3 张低清风格参考板，选择后会作为隐藏参考附加到每次正式生图请求末尾。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={generateStyleImages}
                  disabled={isGeneratingStyleImages || styleCandidates.length === 0}
                  className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition ${isGeneratingStyleImages || styleCandidates.length === 0 ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06] dark:text-gray-600' : 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200'}`}
                >
                  <PhotoIcon className="h-4 w-4" />
                  {isGeneratingStyleImages ? '生成中...' : '生成风格板'}
                </button>
              </div>
              {styleError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
                  {styleError}
                </div>
              )}
              {styleCandidates.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {styleCandidates.map((candidate, index) => {
                    const imageState = styleImages.find((image) => image.candidateIndex === index)
                    const isSelected = selectedStyleIndex === index && imageState?.status === 'done'
                    const canSelect = imageState?.status === 'done' && imageState.imageId
                    return (
                      <button
                        key={`${candidate.label}-${index}`}
                        type="button"
                        onClick={() => canSelect && selectStyleCandidate(index)}
                        disabled={!canSelect}
                        className={`min-w-0 overflow-hidden rounded-xl border text-left transition ${isSelected ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-500/15 dark:border-violet-300/70 dark:bg-violet-500/10' : canSelect ? 'border-gray-200 bg-white hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:hover:bg-white/[0.05]' : 'cursor-not-allowed border-gray-200 bg-white opacity-70 dark:border-white/[0.08] dark:bg-gray-900'}`}
                      >
                        <div className="aspect-square bg-gray-100 dark:bg-white/[0.04]">
                          {imageState?.status === 'done' && imageState.dataUrl ? (
                            <img src={imageState.dataUrl} alt={candidate.label} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-gray-400">
                              {imageState?.status === 'running' ? '生成中...' : imageState?.status === 'error' ? '生成失败' : '待生成'}
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{candidate.label}</span>
                            {isSelected && (
                              <span className="shrink-0 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">已选</span>
                            )}
                          </div>
                          <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{candidate.description}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              {selectedStyleCandidate && selectedStyleImage?.imageId && (
                <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-800 dark:border-violet-300/20 dark:bg-violet-400/10 dark:text-violet-200">
                  已选择「{selectedStyleCandidate.label}」。正式生成时会隐藏附加这张风格参考板作为最后一张参考图，用于统一字体感觉、色板、光影、材质和标注样式，不复制其中占位文字、固定版式或产品摆放。
                </div>
              )}
              {styleReferenceLimitExceeded && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                  当前产品参考图加隐藏风格板共 {effectiveReferenceCount} 张，超过上限 {API_MAX_IMAGES} 张，请删除一张产品参考图后再提交。
                </div>
              )}
            </div>
          )}
          {plannerMode === 'listing' && imagePlans.length > 0 && (
            <div className="mb-4">
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
            <div className="mb-4">
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
                    当前选择 {getAPlusContentTypeLabel(aPlusType)}，点击 AI策划A+ 后生成逐模块方案。
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                  {aPlusSpecs.length} 张
                </span>
              </div>
              <div className={PLAN_LIST_CLASS}>
                {aPlusSpecs.map((spec) => (
                  <div key={spec.slot} className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-gray-900">
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
  )
}
