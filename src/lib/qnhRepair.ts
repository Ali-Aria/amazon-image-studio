import type {
  QnhAuthenticityChecklist,
  QnhBridgeHealth,
  QnhExecutionSummary,
  QnhExistingImageReview,
  QnhInventoryImage,
  QnhInventorySnapshot,
  QnhOutputReview,
  QnhPlanSummary,
  QnhRepairDraft,
  QnhRepairPlanRequest,
  QnhSpecialInventoryItem,
  RetailImageProcessingMode,
  RetailProject,
  RetailSlotId,
  RetailSourceImageRole,
} from '../types'

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8768'
const RETAIL_SLOT_IDS = new Set<RetailSlotId>([
  '01-main',
  '02-front',
  '03-selling-points',
  '04-detail',
  '05-scene',
  '06-specification',
  '07-detail-page',
  '08-special',
])
const SOURCE_ROLES = new Set<RetailSourceImageRole>(['product', 'back_label', 'gift_pack', 'authentic_document'])
const PROCESSING_MODES = new Set<RetailImageProcessingMode>(['ai', 'deterministic', 'ai-preserve', 'source-only'])
const CHECKLIST_KEYS: Array<keyof QnhAuthenticityChecklist> = [
  'packagingText',
  'brand',
  'specification',
  'color',
  'unitCount',
  'structure',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeQnhBridgeUrl(value: string) {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('Bridge 地址格式无效')
  }
  if (url.protocol !== 'http:') throw new Error('Bridge 仅允许本机 HTTP 地址')
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.hostname !== '[::1]') {
    throw new Error('Bridge 必须使用本机回环地址')
  }
  if (url.username || url.password || (url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new Error('Bridge 必须填写不带路径、参数或凭据的根地址')
  }
  return url.origin
}

export function createEmptyQnhRepairDraft(): QnhRepairDraft {
  return {
    bridgeUrl: DEFAULT_BRIDGE_URL,
    spuId: '',
    inventory: null,
    existingDecisions: {},
    outputReviews: {},
    detachAcknowledged: false,
    planId: null,
    planSummary: null,
    execution: null,
  }
}

function normalizeInventoryImage(value: unknown): QnhInventoryImage | null {
  if (!isRecord(value)) return null
  const kind = value.kind === 'main' || value.kind === 'detail' || value.kind === 'special' ? value.kind : null
  const index = finiteNumber(value.index)
  const pictureType = finiteNumber(value.pictureType)
  const id = stringValue(value.id)
  const url = stringValue(value.url)
  if (!kind || index === null || !id || !url) return null
  return { id, kind, index, url, ...(pictureType === null ? {} : { pictureType }) }
}

function normalizeSpecialInventory(value: unknown): QnhSpecialInventoryItem | null {
  if (!isRecord(value)) return null
  const pictureType = finiteNumber(value.pictureType)
  if (pictureType === null) return null
  return {
    pictureType,
    label: stringValue(value.label, `特殊图 ${pictureType}`),
    required: value.required === true,
    images: Array.isArray(value.images) ? value.images.flatMap((item) => normalizeInventoryImage(item) ?? []) : [],
  }
}

function normalizeInventory(value: unknown): QnhInventorySnapshot | null {
  if (!isRecord(value)) return null
  const spuId = stringValue(value.spuId)
  const fingerprint = stringValue(value.fingerprint)
  if (!spuId || !fingerprint) return null
  return {
    spuId,
    productName: stringValue(value.productName),
    mainImages: Array.isArray(value.mainImages) ? value.mainImages.flatMap((item) => normalizeInventoryImage(item) ?? []) : [],
    detailImages: Array.isArray(value.detailImages) ? value.detailImages.flatMap((item) => normalizeInventoryImage(item) ?? []) : [],
    specialImages: Array.isArray(value.specialImages) ? value.specialImages.flatMap((item) => normalizeSpecialInventory(item) ?? []) : [],
    customizedMain: value.customizedMain === true,
    customizedDetail: value.customizedDetail === true,
    fingerprint,
    fetchedAt: stringValue(value.fetchedAt),
  }
}

function normalizeExistingDecisions(value: unknown): Record<string, QnhExistingImageReview> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([id, review]) => {
    if (!isRecord(review)) return []
    if (review.decision !== 'unreviewed' && review.decision !== 'keep' && review.decision !== 'remove') return []
    return [[id, { decision: review.decision, reason: stringValue(review.reason) } satisfies QnhExistingImageReview]]
  }))
}

function normalizeChecklist(value: unknown): QnhAuthenticityChecklist {
  const source = isRecord(value) ? value : {}
  return Object.fromEntries(CHECKLIST_KEYS.map((key) => [key, source[key] === true])) as unknown as QnhAuthenticityChecklist
}

function normalizeOutputReviews(value: unknown): Partial<Record<RetailSlotId, QnhOutputReview>> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([key, review]) => {
    if (!RETAIL_SLOT_IDS.has(key as RetailSlotId) || !isRecord(review)) return []
    const target = review.target === 'main' || review.target === 'detail' || review.target === 'special' ? review.target : null
    const verdict = review.verdict === 'unreviewed' || review.verdict === 'pass' || review.verdict === 'reject' ? review.verdict : null
    const sourceRole = SOURCE_ROLES.has(review.sourceRole as RetailSourceImageRole) ? review.sourceRole as RetailSourceImageRole : null
    const processingMode = PROCESSING_MODES.has(review.processingMode as RetailImageProcessingMode) ? review.processingMode as RetailImageProcessingMode : null
    if (!target || !verdict || !sourceRole || !processingMode) return []
    return [[key, {
      slotId: key as RetailSlotId,
      target,
      pictureType: finiteNumber(review.pictureType),
      sourceImageId: stringValue(review.sourceImageId),
      outputImageId: stringValue(review.outputImageId),
      sourceRole,
      processingMode,
      verdict,
      checklist: normalizeChecklist(review.checklist),
      note: stringValue(review.note),
    } satisfies QnhOutputReview]]
  }))
}

function normalizePlanSummary(value: unknown): QnhPlanSummary | null {
  if (!isRecord(value)) return null
  const status = value.status === 'planned' || value.status === 'executing' || value.status === 'succeeded' || value.status === 'failed' ? value.status : null
  if (!status || typeof value.planId !== 'string' || typeof value.sha256 !== 'string' || typeof value.confirmationPhrase !== 'string') return null
  return {
    planId: value.planId,
    sha256: value.sha256,
    confirmationPhrase: value.confirmationPhrase,
    addedMain: finiteNumber(value.addedMain) ?? 0,
    addedDetail: finiteNumber(value.addedDetail) ?? 0,
    addedSpecial: finiteNumber(value.addedSpecial) ?? 0,
    removed: finiteNumber(value.removed) ?? 0,
    status,
  }
}

function normalizeExecution(value: unknown): QnhExecutionSummary | null {
  if (!isRecord(value)) return null
  const status = value.status === 'planned' || value.status === 'executing' || value.status === 'succeeded' || value.status === 'failed' ? value.status : null
  if (!status || typeof value.planId !== 'string') return null
  return {
    planId: value.planId,
    status,
    startedAt: nullableString(value.startedAt),
    finishedAt: nullableString(value.finishedAt),
    error: nullableString(value.error),
    ledger: Array.isArray(value.ledger) ? value.ledger.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.ts !== 'string' || typeof entry.phase !== 'string' || typeof entry.message !== 'string') return []
      const entryStatus = entry.status === 'info' || entry.status === 'pass' || entry.status === 'fail' ? entry.status : 'info'
      return [{ ts: entry.ts, phase: entry.phase, status: entryStatus, message: entry.message }]
    }) : [],
  }
}

export function normalizeQnhRepairDraft(value: unknown): QnhRepairDraft {
  const base = createEmptyQnhRepairDraft()
  if (!isRecord(value)) return base
  let bridgeUrl = base.bridgeUrl
  if (typeof value.bridgeUrl === 'string') {
    try {
      bridgeUrl = normalizeQnhBridgeUrl(value.bridgeUrl)
    } catch {
      bridgeUrl = base.bridgeUrl
    }
  }
  return {
    bridgeUrl,
    spuId: stringValue(value.spuId),
    inventory: normalizeInventory(value.inventory),
    existingDecisions: normalizeExistingDecisions(value.existingDecisions),
    outputReviews: normalizeOutputReviews(value.outputReviews),
    detachAcknowledged: value.detachAcknowledged === true,
    planId: nullableString(value.planId),
    planSummary: normalizePlanSummary(value.planSummary),
    execution: normalizeExecution(value.execution),
  }
}

export function applyQnhInventory(draft: QnhRepairDraft, inventory: QnhInventorySnapshot): QnhRepairDraft {
  if (draft.inventory?.fingerprint === inventory.fingerprint) return { ...draft, inventory, spuId: inventory.spuId }
  return {
    ...draft,
    spuId: inventory.spuId,
    inventory,
    existingDecisions: {},
    outputReviews: {},
    detachAcknowledged: false,
    planId: null,
    planSummary: null,
    execution: null,
  }
}

const EMPTY_CHECKLIST: QnhAuthenticityChecklist = {
  packagingText: false,
  brand: false,
  specification: false,
  color: false,
  unitCount: false,
  structure: false,
}

function targetForSlot(slotId: RetailSlotId) {
  if (slotId === '07-detail-page') return 'detail' as const
  if (slotId === '08-special') return 'special' as const
  return 'main' as const
}

export function syncQnhRepairOutputReviews(project: RetailProject): QnhRepairDraft {
  const draft = project.qnhRepair
  const defaultProductSource = project.sourceImageIds.find((id) => (project.sourceImageRoles[id] ?? 'product') === 'product') ?? ''
  const specialPlan = project.plans.find((plan) => plan.id === '08-special')
  const nextReviews = Object.fromEntries(project.slots.flatMap((slot) => {
    const outputImageId = slot.composedImageId || slot.outputImageId
    if (slot.status !== 'done' || !outputImageId) return []
    const existing = draft.outputReviews[slot.slotId]
    if (existing?.outputImageId === outputImageId) return [[slot.slotId, existing]]
    const processingMode = slot.slotId === '08-special' ? specialPlan?.processingMode ?? 'ai' : 'ai'
    const sourceRole = slot.slotId === '08-special' ? specialPlan?.requiredSourceRole ?? 'product' : 'product'
    const sourceImageId = processingMode === 'source-only'
      ? outputImageId
      : project.sourceImageIds.find((id) => (project.sourceImageRoles[id] ?? 'product') === sourceRole) ?? defaultProductSource
    return [[slot.slotId, {
      slotId: slot.slotId,
      target: targetForSlot(slot.slotId),
      pictureType: null,
      sourceImageId,
      outputImageId,
      sourceRole,
      processingMode,
      verdict: 'unreviewed',
      checklist: { ...EMPTY_CHECKLIST },
      note: '',
    } satisfies QnhOutputReview]]
  })) as Partial<Record<RetailSlotId, QnhOutputReview>>
  const current = JSON.stringify(draft.outputReviews)
  const next = JSON.stringify(nextReviews)
  if (current === next) return draft
  return {
    ...draft,
    outputReviews: nextReviews,
    planId: null,
    planSummary: null,
    execution: null,
  }
}

export function getQnhInventoryImages(inventory: QnhInventorySnapshot) {
  return [
    ...inventory.mainImages,
    ...inventory.detailImages,
    ...inventory.specialImages.flatMap((group) => group.images),
  ]
}

export interface QnhRepairReadiness {
  ready: boolean
  issues: string[]
  reviewedExisting: number
  totalExisting: number
  passedOutputs: number
}

export function getQnhRepairReadiness(draft: QnhRepairDraft): QnhRepairReadiness {
  const issues: string[] = []
  if (!/^\d+$/.test(draft.spuId)) issues.push('SPU ID 必须是数字')
  if (!draft.inventory) {
    issues.push('请先读取牵牛花现有图集')
    return { ready: false, issues, reviewedExisting: 0, totalExisting: 0, passedOutputs: 0 }
  }
  if (draft.inventory.spuId !== draft.spuId) issues.push('当前 SPU 与图集快照不一致')
  const images = getQnhInventoryImages(draft.inventory)
  const unreviewed = images.filter((image) => {
    const decision = draft.existingDecisions[image.id]?.decision
    return decision !== 'keep' && decision !== 'remove'
  })
  if (unreviewed.length > 0) issues.push(`还有 ${unreviewed.length} 张现有图片未审核`)
  if (images.some((image) => {
    const review = draft.existingDecisions[image.id]
    return review?.decision === 'remove' && !review.reason.trim()
  })) issues.push('剔除图片必须填写原因')

  const outputReviews = Object.values(draft.outputReviews).filter((review): review is QnhOutputReview => Boolean(review))
  const passedOutputs = outputReviews.filter((review) => review.verdict === 'pass')
  if (outputReviews.some((review) => review.verdict === 'unreviewed')) issues.push('还有拟写入图片未完成 PASS/REJECT 审核')
  for (const review of passedOutputs) {
    if (!review.sourceImageId || !review.outputImageId) issues.push(`${review.slotId} 缺少真实来源图或成图`)
    if (review.processingMode !== 'source-only' && review.sourceImageId && review.sourceImageId === review.outputImageId) {
      issues.push(`${review.slotId} 真实来源图不能与成图相同`)
    }
    if (CHECKLIST_KEYS.some((key) => !review.checklist[key])) issues.push(`${review.slotId} 包装保真核对未完成`)
    if (review.target === 'special' && review.pictureType === null) issues.push('特殊图必须选择牵牛花 pictureType')
    if ((review.sourceRole === 'authentic_document' || review.sourceRole === 'back_label') && review.processingMode !== 'source-only') {
      issues.push('证照或背标只能原图直传，禁止 AI 生成')
    }
  }
  if (passedOutputs.length === 0 && images.every((image) => draft.existingDecisions[image.id]?.decision === 'keep')) {
    issues.push('计划没有任何变更')
  }
  if (!draft.detachAcknowledged) issues.push('必须确认门店级图片将与租户主档后续图片更新解耦')
  return {
    ready: issues.length === 0,
    issues: [...new Set(issues)],
    reviewedExisting: images.length - unreviewed.length,
    totalExisting: images.length,
    passedOutputs: passedOutputs.length,
  }
}

export function buildQnhRepairPlanRequest(input: {
  project: RetailProject
  health: QnhBridgeHealth
  imageDataUrls: Record<string, string>
  now?: Date
}): QnhRepairPlanRequest {
  const draft = input.project.qnhRepair
  const readiness = getQnhRepairReadiness(draft)
  if (!readiness.ready || !draft.inventory) throw new Error(readiness.issues[0] ?? '修复计划尚未就绪')
  const images = getQnhInventoryImages(draft.inventory)
  const outputs = Object.values(draft.outputReviews).flatMap((review) => {
    if (!review || review.verdict !== 'pass') return []
    const sourceDataUrl = input.imageDataUrls[review.sourceImageId]
    const outputDataUrl = input.imageDataUrls[review.outputImageId]
    if (!sourceDataUrl || !outputDataUrl) throw new Error(`${review.slotId} 的源图或成图尚未加载`)
    if (input.health.mode === 'real' && /^data:image\/webp(?:;|,)/i.test(outputDataUrl)) {
      throw new Error(`${review.slotId} 真实模式暂只允许 PNG 或 JPEG 输出`)
    }
    return [{ ...review, verdict: 'pass' as const, sourceDataUrl, outputDataUrl }]
  })
  return {
    schemaVersion: 1,
    identity: {
      storeName: input.health.storeName,
      tenantId: input.health.tenantId,
      storeId: input.health.storeId,
    },
    product: {
      spuId: draft.spuId,
      name: input.project.product.name,
      barcode: input.project.product.barcode,
      sku: input.project.product.sku,
    },
    inventory: {
      fingerprint: draft.inventory.fingerprint,
      fetchedAt: draft.inventory.fetchedAt,
      mainImages: draft.inventory.mainImages,
      detailImages: draft.inventory.detailImages,
      specialImages: draft.inventory.specialImages,
      customizedMain: draft.inventory.customizedMain,
      customizedDetail: draft.inventory.customizedDetail,
      decisions: images.map((image) => ({
        ...image,
        imageId: image.id,
        ...draft.existingDecisions[image.id],
      })),
    },
    outputs,
    detachAcknowledged: true,
    createdAt: (input.now ?? new Date()).toISOString(),
  }
}
