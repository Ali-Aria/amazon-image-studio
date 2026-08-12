import type {
  RetailProject,
  RetailProjectSlot,
  RetailSourceImageRole,
  RetailSpecialImageType,
  RetailSlotId,
  TaskRecord,
} from '../types'
import { RETAIL_SLOT_IDS } from './retailPlanner'
import { createEmptyRetailProduct } from './retailProduct'
import { createEmptyQnhRepairDraft, normalizeQnhRepairDraft } from './qnhRepair'

export const RETAIL_PROJECTS_CHANGED_EVENT = 'instant-retail-projects-changed'

const RETAIL_PROJECT_SLOT_IDS: RetailSlotId[] = RETAIL_SLOT_IDS
const SOURCE_IMAGE_ROLES = new Set<RetailSourceImageRole>(['product', 'back_label', 'gift_pack', 'authentic_document'])
const SPECIAL_IMAGE_TYPES = new Set<RetailSpecialImageType>([
  'product_facts',
  'dimension',
  'size_guide',
  'gift_pack',
  'back_label',
  'authentic_document',
])

function createProjectId() {
  return globalThis.crypto?.randomUUID?.() ?? `retail-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createRetailProject(now = Date.now()): RetailProject {
  return {
    id: createProjectId(),
    title: '新建商品图集',
    product: createEmptyRetailProduct(),
    sourceImageIds: [],
    sourceImageRoles: {},
    specialImageType: 'auto',
    platformPresetId: 'meituan-square',
    styleId: 'clean-retail',
    concurrency: 2,
    batchStartIndex: 1,
    queuePaused: false,
    plans: [],
    slots: RETAIL_PROJECT_SLOT_IDS.map(createEmptySlot),
    qnhRepair: createEmptyQnhRepairDraft(),
    createdAt: now,
    updatedAt: now,
  }
}

export function collectRetailProjectImageIds(project: RetailProject): string[] {
  const ids = [
    ...project.sourceImageIds,
    ...project.slots.flatMap((slot) => [slot.outputImageId, slot.composedImageId]),
  ]
  return Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && Boolean(id))))
}

function createEmptySlot(slotId: RetailSlotId): RetailProjectSlot {
  return {
    slotId,
    status: 'idle',
    taskId: null,
    outputImageId: null,
    composedImageId: null,
    error: null,
    qualityStatus: 'unchecked',
  }
}

export function normalizeRetailProject(value: unknown, now = Date.now()): RetailProject {
  const source = value && typeof value === 'object' ? value as Partial<RetailProject> : {}
  const base = createRetailProject(now)
  const sourceProduct: Partial<RetailProject['product']> = source.product && typeof source.product === 'object' ? source.product : {}
  const incomingSlots = Array.isArray(source.slots) ? source.slots : []
  const sourceImageIds = Array.isArray(source.sourceImageIds) ? source.sourceImageIds.filter((id): id is string => typeof id === 'string') : []
  const sourceImageRoles = source.sourceImageRoles && typeof source.sourceImageRoles === 'object'
    ? Object.fromEntries(Object.entries(source.sourceImageRoles).filter(
      (entry): entry is [string, RetailSourceImageRole] => sourceImageIds.includes(entry[0]) && SOURCE_IMAGE_ROLES.has(entry[1] as RetailSourceImageRole),
    ))
    : {}

  return {
    ...base,
    ...source,
    id: typeof source.id === 'string' && source.id ? source.id : base.id,
    title: typeof source.title === 'string' && source.title ? source.title : base.title,
    product: {
      ...base.product,
      ...sourceProduct,
      sellingPoints: Array.isArray(sourceProduct.sellingPoints) ? sourceProduct.sellingPoints.filter((value: unknown): value is string => typeof value === 'string') : [],
      attributes: sourceProduct.attributes && typeof sourceProduct.attributes === 'object' ? sourceProduct.attributes : {},
      factSources: sourceProduct.factSources && typeof sourceProduct.factSources === 'object' ? sourceProduct.factSources : {},
      factVerification: sourceProduct.factVerification && typeof sourceProduct.factVerification === 'object' ? sourceProduct.factVerification : {},
    },
    sourceImageIds,
    sourceImageRoles,
    specialImageType: source.specialImageType === 'auto' || SPECIAL_IMAGE_TYPES.has(source.specialImageType as RetailSpecialImageType)
      ? source.specialImageType as RetailSpecialImageType | 'auto'
      : 'auto',
    plans: Array.isArray(source.plans) ? source.plans : [],
    slots: RETAIL_PROJECT_SLOT_IDS.map((slotId) => {
      const candidate = incomingSlots.find((slot) => slot?.slotId === slotId)
      if (!candidate) return createEmptySlot(slotId)

      const slot = { ...createEmptySlot(slotId), ...candidate, slotId }
      if ((slot.status === 'queued' || slot.status === 'running') && !slot.taskId) {
        return { ...slot, status: 'idle' as const }
      }
      return slot
    }),
    qnhRepair: normalizeQnhRepairDraft(source.qnhRepair),
    concurrency: source.concurrency === 1 || source.concurrency === 2 || source.concurrency === 3 ? source.concurrency : 2,
    batchStartIndex: source.batchStartIndex === 2 ? 2 : 1,
    queuePaused: false,
    createdAt: typeof source.createdAt === 'number' ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : now,
  }
}

export function syncRetailProjectTasks(project: RetailProject, tasks: TaskRecord[], now = Date.now()): RetailProject {
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  let changed = false
  const slots = project.slots.map((slot) => {
    if (!slot.taskId) return slot
    const task = taskById.get(slot.taskId)
    if (!task) return slot

    const next = task.status === 'done'
      ? { ...slot, status: 'done' as const, outputImageId: task.outputImages[0] ?? slot.outputImageId, error: null }
      : task.status === 'error'
        ? { ...slot, status: 'error' as const, error: task.error || '生成失败' }
        : { ...slot, status: 'running' as const, error: null }
    if (JSON.stringify(next) !== JSON.stringify(slot)) changed = true
    return next
  })

  return changed ? { ...project, slots, updatedAt: now } : project
}
