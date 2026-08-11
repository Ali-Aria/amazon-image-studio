import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Clock3, FilePlus2, Images, PackageSearch, ShieldCheck, Trash2 } from 'lucide-react'
import type {
  InputImage,
  RetailArchetype,
  RetailImagePlan,
  RetailProduct,
  RetailProject,
  RetailProjectSlot,
  RetailSourceImageRole,
  RetailSlotId,
} from '../types'
import { DEFAULT_PARAMS } from '../types'
import {
  deleteRetailProject,
  getAllRetailProjects,
  getImage,
  putRetailProject,
  storeImage,
} from '../lib/db'
import { createRetailImagePlan, RETAIL_SLOT_IDS } from '../lib/retailPlanner'
import { applyRetailCatalogRecord, lookupRetailCatalogProduct } from '../lib/retailCatalog'
import { buildRetailBatchZip, downloadRetailBatchZip, groupRetailBatchFiles, type RetailBatchExportEntry } from '../lib/retailBatch'
import { getRetailPlatformPreset } from '../lib/retailPlatform'
import { createRetailProject, normalizeRetailProject, RETAIL_PROJECTS_CHANGED_EVENT, syncRetailProjectTasks } from '../lib/retailProject'
import { loadRetailKnowledge, matchRetailCategory, type RetailKnowledgeIndex } from '../lib/retailKnowledge'
import { getTrustedRetailFacts, validateRetailProduct } from '../lib/retailProduct'
import { RetailGenerationQueue } from '../lib/retailQueue'
import { composeRetailImageDataUrl } from '../lib/retailComposer'
import { retailEncodeTargetFromPreset } from '../lib/retailEncoder'
import { dataUrlByteLength, evaluateRetailSlotQuality, type RetailImageMetadata, type RetailQualityReport } from '../lib/retailQuality'
import { buildRetailProjectZip, downloadRetailProjectZip, type RetailExportLayout } from '../lib/retailExporter'
import { ensureImageCached, submitPreparedTask, useStore, waitForTaskCompletion } from '../store'
import { evaluateRetailSpecialImage } from '../lib/retailSpecialImage'
import { getRetailGenerationTargets, selectRetailPlanInputs } from '../lib/retailSpecialExecution'
import ProductPanel from './retail/ProductPanel'
import SourceUploader from './retail/SourceUploader'
import SpecialImageControls from './retail/SpecialImageControls'
import PlatformControls from './retail/PlatformControls'
import BatchPanel from './retail/BatchPanel'
import PlanBoard from './retail/PlanBoard'
import QualityPanel from './retail/QualityPanel'
import ProgressDock from './retail/ProgressDock'

const RetailHistoryDialog = lazy(() => import('./retail/RetailHistoryDialog'))

const FALLBACK_ARCHETYPE: RetailArchetype = {
  id: 'other',
  label: '通用商品',
  match_keywords: [],
  required_facts: ['商品名称', '品牌', '净含量或尺寸', '包装形态', '售卖规格'],
  slot_plan: [],
  forbidden: [
    '不得编造品牌、规格、配料、功效、认证、产地、适用人群或包装数量',
    '不得出现价格、具体优惠券、二维码、水印、联系方式或其他平台标识',
  ],
}

type QueueItem = { id: RetailSlotId; plan: RetailImagePlan }
type MobileTab = 'product' | 'images' | 'quality'

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`))
    reader.readAsDataURL(file)
  })
}

function metadataFromStoredImage(image: { dataUrl: string; width?: number; height?: number }): RetailImageMetadata | null {
  if (!image.width || !image.height) return null
  return { width: image.width, height: image.height, bytes: dataUrlByteLength(image.dataUrl) }
}

function clearSpecialSlot(slot: RetailProjectSlot): RetailProjectSlot {
  if (slot.slotId !== '08-special') return slot
  return {
    ...slot,
    status: 'idle',
    taskId: null,
    outputImageId: null,
    composedImageId: null,
    error: null,
    qualityStatus: 'unchecked',
  }
}

export default function RetailStudio() {
  const tasks = useStore((state) => state.tasks)
  const showToast = useStore((state) => state.showToast)
  const setConfirmDialog = useStore((state) => state.setConfirmDialog)
  const setLightboxImageId = useStore((state) => state.setLightboxImageId)
  const [project, setProject] = useState<RetailProject>(() => createRetailProject())
  const [projects, setProjects] = useState<RetailProject[]>([])
  const [knowledge, setKnowledge] = useState<RetailKnowledgeIndex | null>(null)
  const [sourceImages, setSourceImages] = useState<InputImage[]>([])
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [imageMetadata, setImageMetadata] = useState<Record<string, RetailImageMetadata>>({})
  const [mobileTab, setMobileTab] = useState<MobileTab>('product')
  const [showHistory, setShowHistory] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; failed: number } | null>(null)
  const queueRef = useRef<RetailGenerationQueue<QueueItem> | null>(null)
  const projectRef = useRef(project)
  const sourceImagesRef = useRef(sourceImages)

  useEffect(() => { projectRef.current = project }, [project])
  useEffect(() => { sourceImagesRef.current = sourceImages }, [sourceImages])

  useEffect(() => {
    let cancelled = false
    void Promise.all([getAllRetailProjects(), loadRetailKnowledge()])
      .then(async ([savedProjects, categoryKnowledge]) => {
        if (cancelled) return
        const normalized = savedProjects.map((saved) => normalizeRetailProject(saved)).sort((a, b) => b.updatedAt - a.updatedAt)
        const active = normalized[0] ?? createRetailProject()
        if (normalized.length === 0) await putRetailProject(active)
        setProjects(normalized.length > 0 ? normalized : [active])
        setProject(active)
        setKnowledge(categoryKnowledge)
        setLoaded(true)
      })
      .catch((error) => {
        if (cancelled) return
        setLoaded(true)
        showToast(error instanceof Error ? error.message : '工作台加载失败', 'error')
      })
    return () => { cancelled = true }
  }, [showToast])

  useEffect(() => {
    const refreshProjects = () => {
      void getAllRetailProjects()
        .then(async (savedProjects) => {
          const normalized = savedProjects.map((saved) => normalizeRetailProject(saved)).sort((a, b) => b.updatedAt - a.updatedAt)
          const active = normalized[0] ?? createRetailProject()
          if (normalized.length === 0) await putRetailProject(active)
          setProjects(normalized.length > 0 ? normalized : [active])
          setProject(active)
        })
        .catch((error) => showToast(error instanceof Error ? error.message : '商品项目刷新失败', 'error'))
    }
    window.addEventListener(RETAIL_PROJECTS_CHANGED_EVENT, refreshProjects)
    return () => window.removeEventListener(RETAIL_PROJECTS_CHANGED_EVENT, refreshProjects)
  }, [showToast])

  useEffect(() => {
    if (!loaded) return
    let cancelled = false
    const sourceIds = project.sourceImageIds
    const finalIds = project.slots
      .flatMap((slot) => [slot.composedImageId, slot.outputImageId])
      .filter((id): id is string => Boolean(id))
    void Promise.all([...new Set([...sourceIds, ...finalIds])].map(async (id) => [id, await getImage(id)] as const))
      .then((entries) => {
        if (cancelled) return
        const byId = new Map(entries)
        setSourceImages(sourceIds.flatMap((id) => {
          const image = byId.get(id)
          return image?.dataUrl ? [{ id, dataUrl: image.dataUrl }] : []
        }))
        setPreviews((current) => {
          const next = { ...current }
          for (const [id, image] of entries) if (image?.dataUrl) next[id] = image.dataUrl
          return next
        })
        setImageMetadata((current) => {
          const next = { ...current }
          for (const [id, image] of entries) {
            const metadata = image ? metadataFromStoredImage(image) : null
            if (metadata) next[id] = metadata
          }
          return next
        })
      })
    return () => { cancelled = true }
  }, [loaded, project.id])

  useEffect(() => {
    if (!loaded) return
    const timer = window.setTimeout(() => {
      void putRetailProject(project)
      setProjects((current) => {
        const next = current.some((item) => item.id === project.id)
          ? current.map((item) => item.id === project.id ? project : item)
          : [project, ...current]
        return next.sort((a, b) => b.updatedAt - a.updatedAt)
      })
    }, 220)
    return () => window.clearTimeout(timer)
  }, [loaded, project])

  useEffect(() => {
    setProject((current) => syncRetailProjectTasks(current, tasks))
  }, [tasks])

  const categoryMatch = useMemo(() => {
    if (!knowledge || !project.product.categoryPath.trim()) return null
    return matchRetailCategory(knowledge, project.product.platform, project.product.categoryPath)
  }, [knowledge, project.product.categoryPath, project.product.platform])

  const resolveArchetype = (product: RetailProduct): RetailArchetype => {
    if (!product.categoryPath.trim()) return FALLBACK_ARCHETYPE
    const match = knowledge ? matchRetailCategory(knowledge, product.platform, product.categoryPath) : null
    if (match) return match.archetype
    if (!knowledge) return FALLBACK_ARCHETYPE
    const source = knowledge.data.archetypes[product.archetypeId] ?? knowledge.data.archetypes.other
    return { id: product.archetypeId, ...source }
  }

  const archetype = useMemo<RetailArchetype>(() => {
    if (!project.product.categoryPath.trim()) return FALLBACK_ARCHETYPE
    if (categoryMatch) return categoryMatch.archetype
    if (!knowledge) return FALLBACK_ARCHETYPE
    const source = knowledge.data.archetypes[project.product.archetypeId] ?? knowledge.data.archetypes.other
    return { id: project.product.archetypeId, ...source }
  }, [categoryMatch, knowledge, project.product.archetypeId, project.product.categoryPath])

  useEffect(() => {
    if (!categoryMatch || project.product.archetypeId === categoryMatch.archetype.id) return
    setProject((current) => ({
      ...current,
      product: { ...current.product, archetypeId: categoryMatch.archetype.id },
      updatedAt: Date.now(),
    }))
  }, [categoryMatch, project.product.archetypeId])

  const sourceImageRoles = useMemo(() => Object.fromEntries(
    project.sourceImageIds.map((id) => [id, project.sourceImageRoles[id] ?? 'product']),
  ) as Record<string, RetailSourceImageRole>, [project.sourceImageIds, project.sourceImageRoles])

  const specialEvaluation = useMemo(() => evaluateRetailSpecialImage({
    product: project.product,
    archetype,
    sourceImageRoles,
    preferredType: project.specialImageType,
  }), [archetype, project.product, project.specialImageType, sourceImageRoles])

  const plans = useMemo(
    () => createRetailImagePlan(project.product, archetype, project.platformPresetId, project.styleId, specialEvaluation),
    [archetype, project.platformPresetId, project.product, project.styleId, specialEvaluation],
  )

  useEffect(() => {
    const signature = plans.map((plan) => `${plan.id}:${plan.prompt}:${plan.copyLines.join('|')}:${plan.generationEligible}:${plan.specialImageType ?? ''}:${plan.processingMode}`).join('\n')
    const previous = project.plans.map((plan) => `${plan.id}:${plan.prompt}:${plan.copyLines.join('|')}:${plan.generationEligible}:${plan.specialImageType ?? ''}:${plan.processingMode}`).join('\n')
    if (signature === previous) return
    setProject((current) => ({ ...current, plans, updatedAt: Date.now() }))
  }, [plans, project.plans])

  const productValidation = useMemo(() => validateRetailProduct(project.product, archetype), [archetype, project.product])
  const generating = project.slots.some((slot) => slot.status === 'queued' || slot.status === 'running')
  const completed = project.slots.filter((slot) => slot.slotId !== '08-special' && slot.status === 'done').length
  const specialDone = project.slots.find((slot) => slot.slotId === '08-special')?.status === 'done'
  const canGenerate = sourceImages.some((image) => sourceImageRoles[image.id] === 'product')
    && productValidation.valid
    && plans.filter((plan) => plan.id !== '08-special').length === 7
  const preset = getRetailPlatformPreset(project.platformPresetId)
  const resolveSlotImageId = (slot: RetailProjectSlot) => {
    if (slot.composedImageId && previews[slot.composedImageId]) return slot.composedImageId
    if (slot.outputImageId && previews[slot.outputImageId]) return slot.outputImageId
    return slot.composedImageId || slot.outputImageId
  }

  const qualityReports = useMemo(() => Object.fromEntries(project.slots.map((slot) => {
    const plan = plans.find((item) => item.id === slot.slotId)
    const imageId = resolveSlotImageId(slot)
    return [slot.slotId, evaluateRetailSlotQuality({
      slotId: slot.slotId,
      imageId,
      metadata: imageId ? imageMetadata[imageId] ?? null : null,
      copyLines: plan?.copyLines ?? [],
      preset,
      productValid: productValidation.valid,
      special: plan?.id === '08-special' && plan.specialImageType ? {
        generationEligible: plan.generationEligible,
        processingMode: plan.processingMode,
        specialImageType: plan.specialImageType,
        sourceRolePresent: !plan.requiredSourceRole || Object.values(sourceImageRoles).includes(plan.requiredSourceRole),
        trustedFacts: getTrustedRetailFacts(project.product),
      } : undefined,
    })]
  })) as Record<RetailSlotId, RetailQualityReport>, [imageMetadata, plans, preset, previews, productValidation.valid, project.product, project.slots, sourceImageRoles])

  const updateProject = (updater: (current: RetailProject) => RetailProject) => {
    setProject((current) => {
      const next = updater(current)
      return next.updatedAt === current.updatedAt ? { ...next, updatedAt: Date.now() } : next
    })
  }

  const updateSlot = (slotId: RetailSlotId, patch: Partial<RetailProjectSlot>) => {
    setProject((current) => ({
      ...current,
      slots: current.slots.map((slot) => slot.slotId === slotId ? { ...slot, ...patch } : slot),
      updatedAt: Date.now(),
    }))
  }

  const handleProductChange = (product: RetailProduct) => {
    updateProject((current) => ({
      ...current,
      title: product.name.trim() || current.title,
      product,
      slots: current.slots.map(clearSpecialSlot),
      updatedAt: Date.now(),
    }))
  }

  const handleFiles = async (files: File[]) => {
    const available = Math.max(0, 8 - sourceImagesRef.current.length)
    if (available === 0) return
    try {
      const nextImages = await Promise.all(files.slice(0, available).map(async (file) => {
        const dataUrl = await readFileAsDataUrl(file)
        const id = await storeImage(dataUrl, 'upload')
        return { id, dataUrl }
      }))
      const unique = nextImages.filter((image) => !sourceImagesRef.current.some((current) => current.id === image.id))
      setSourceImages((current) => [...current, ...unique])
      updateProject((current) => ({
        ...current,
        sourceImageIds: [...current.sourceImageIds, ...unique.map((image) => image.id)],
        sourceImageRoles: {
          ...current.sourceImageRoles,
          ...Object.fromEntries(unique.map((image) => [image.id, 'product' as const])),
        },
        slots: current.slots.map(clearSpecialSlot),
        updatedAt: Date.now(),
      }))
    } catch (error) {
      showToast(error instanceof Error ? error.message : '图片读取失败', 'error')
    }
  }

  const handleRemoveSource = (id: string) => {
    setSourceImages((current) => current.filter((image) => image.id !== id))
    updateProject((current) => {
      const sourceImageRoles = { ...current.sourceImageRoles }
      delete sourceImageRoles[id]
      return {
        ...current,
        sourceImageIds: current.sourceImageIds.filter((imageId) => imageId !== id),
        sourceImageRoles,
        slots: current.slots.map(clearSpecialSlot),
        updatedAt: Date.now(),
      }
    })
  }

  const handleSourceRoleChange = (id: string, role: RetailSourceImageRole) => {
    updateProject((current) => ({
      ...current,
      sourceImageRoles: { ...current.sourceImageRoles, [id]: role },
      slots: current.slots.map(clearSpecialSlot),
      updatedAt: Date.now(),
    }))
  }

  /**
   * 跑一个商品项目的生成队列。主动传入项目和原图快照，不读组件状态，
   * 这样批量模式可以在不切换当前项目的前提下依次跑完每个商品。
   */
  const runProjectQueue = (input: {
    project: RetailProject
    sources: InputImage[]
    slotIds: RetailSlotId[]
    onSlot: (slotId: RetailSlotId, patch: Partial<RetailProjectSlot>) => void
  }): Promise<{ failed: number; plans: RetailImagePlan[] }> => {
    const snapshot = input.project
    const sourceSnapshot = input.sources.map((image) => ({ ...image }))
    const updateSlot = input.onSlot
    const archetype = resolveArchetype(snapshot.product)
    const productSnapshot = {
      ...snapshot.product,
      attributes: { ...snapshot.product.attributes },
      sellingPoints: [...snapshot.product.sellingPoints],
      factSources: { ...snapshot.product.factSources },
      factVerification: { ...snapshot.product.factVerification },
    }
    const roleSnapshot = Object.fromEntries(snapshot.sourceImageIds.map((id) => [id, snapshot.sourceImageRoles[id] ?? 'product'])) as Record<string, RetailSourceImageRole>
    const specialSnapshot = evaluateRetailSpecialImage({
      product: productSnapshot,
      archetype,
      sourceImageRoles: roleSnapshot,
      preferredType: snapshot.specialImageType,
    })
    const planSnapshot = createRetailImagePlan(productSnapshot, archetype, snapshot.platformPresetId, snapshot.styleId, specialSnapshot)
    const targets = input.slotIds.flatMap((slotId) => {
      const plan = planSnapshot.find((item) => item.id === slotId)
      return plan?.generationEligible ? [{ id: slotId, plan }] : []
    })
    if (targets.length === 0) return Promise.resolve({ failed: 0, plans: planSnapshot })

    for (const target of targets) updateSlot(target.id, { status: 'queued', error: null })

    const queue = new RetailGenerationQueue<QueueItem>(async ({ id, plan }) => {
      updateSlot(id, { status: 'running', error: null })
      try {
        const execution = selectRetailPlanInputs(plan, sourceSnapshot, roleSnapshot)
        if (execution.images.length === 0) throw new Error('缺少该图片位需要的真实参考图')

        let outputImageId: string
        let outputDataUrl: string
        if (execution.useModel) {
          const taskId = await submitPreparedTask({
            // 逐位负面词已经作为 AVOID 行渲染在 plan.prompt 末尾。绝不能再把整份负面串
            // 追加到正向 prompt：这条链路没有原生 negative_prompt 通道，追加等于把
            // 「价格、优惠券、二维码、水印」这些名词当正向指令喂进生图模型。
            prompt: plan.prompt,
            inputImages: execution.images,
            params: { ...DEFAULT_PARAMS, size: plan.generationSize, quality: 'high', output_format: 'png', output_compression: null, n: 1 },
            category: {
              workflow: 'instant-retail',
              productTitle: productSnapshot.name,
              retailProjectId: snapshot.id,
              retailSlot: id,
            },
            silent: true,
          })
          updateSlot(id, { taskId })
          const task = await waitForTaskCompletion(taskId)
          if (task.status === 'error') throw new Error(task.error || '生成失败')
          outputImageId = task.outputImages[0]
          if (!outputImageId) throw new Error('接口未返回图片')
          outputDataUrl = await ensureImageCached(outputImageId) ?? ''
          if (!outputDataUrl) throw new Error('生成图片已丢失')
        } else {
          outputImageId = execution.images[0].id
          outputDataUrl = execution.images[0].dataUrl
        }
        updateSlot(id, { outputImageId })
        const snapshotPreset = getRetailPlatformPreset(snapshot.platformPresetId)
        const encoded = await composeRetailImageDataUrl(
          outputDataUrl,
          plan,
          productSnapshot,
          retailEncodeTargetFromPreset(snapshotPreset),
        )
        const composedDataUrl = encoded.dataUrl
        const composedImageId = await storeImage(composedDataUrl, 'generated')
        const metadata = {
          width: plan.targetSize.width,
          height: plan.targetSize.height,
          bytes: encoded.bytes,
        }
        const report = evaluateRetailSlotQuality({
          slotId: id,
          imageId: composedImageId,
          metadata,
          copyLines: plan.copyLines,
          preset: snapshotPreset,
          productValid: true,
          special: plan.id === '08-special' && plan.specialImageType ? {
            generationEligible: plan.generationEligible,
            processingMode: plan.processingMode,
            specialImageType: plan.specialImageType,
            sourceRolePresent: !plan.requiredSourceRole || Object.values(roleSnapshot).includes(plan.requiredSourceRole),
            trustedFacts: getTrustedRetailFacts(productSnapshot),
          } : undefined,
        })
        setPreviews((current) => ({ ...current, [outputImageId]: outputDataUrl, [composedImageId]: composedDataUrl }))
        setImageMetadata((current) => ({ ...current, [composedImageId]: metadata }))
        updateSlot(id, {
          status: 'done',
          outputImageId,
          composedImageId,
          error: null,
          qualityStatus: report.status === 'blocked' ? 'blocked' : report.status,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        updateSlot(id, { status: 'error', error: message, qualityStatus: 'blocked' })
        throw error
      }
    }, { concurrency: snapshot.concurrency })

    queueRef.current = queue
    queue.enqueue(targets)
    return queue.waitForIdle().then(() => ({
      failed: queue.getSnapshot().filter((item) => item.status === 'error').length,
      plans: planSnapshot,
    }))
  }

  const startQueue = (slotIds: RetailSlotId[]) => {
    if (generating || batchRunning) return
    if (!sourceImagesRef.current.length) {
      setMobileTab('product')
      showToast('请先上传商品原图', 'error')
      return
    }
    if (!productValidation.valid) {
      setMobileTab('product')
      showToast(`请先补齐 ${productValidation.errors[0]?.label ?? '商品资料'}`, 'error')
      return
    }

    const snapshot = projectRef.current
    setProject((current) => ({ ...current, queuePaused: false, updatedAt: Date.now() }))
    void runProjectQueue({
      project: snapshot,
      sources: sourceImagesRef.current,
      slotIds,
      onSlot: updateSlot,
    }).then(({ failed }) => {
      setProject((current) => ({ ...current, queuePaused: false, updatedAt: Date.now() }))
      showToast(failed ? `${failed} 张生成失败，可单独重试` : '本轮图片生成完成', failed ? 'error' : 'success')
    })
  }

  const handleGenerateAll = () => {
    startQueue(getRetailGenerationTargets(plans, project.slots))
    setMobileTab('images')
  }

  const handlePauseToggle = () => {
    const queue = queueRef.current
    if (!queue) return
    if (project.queuePaused) queue.resume()
    else queue.pause()
    setProject((current) => ({ ...current, queuePaused: !current.queuePaused, updatedAt: Date.now() }))
  }

  const handleExport = async (layout: RetailExportLayout = 'readable') => {
    setExporting(true)
    try {
      const ids = project.slots.flatMap((slot) => [slot.composedImageId, slot.outputImageId]).filter((id): id is string => Boolean(id))
      const entries = await Promise.all(ids.map(async (id) => [id, await ensureImageCached(id)] as const))
      const images = Object.fromEntries(entries.filter((entry): entry is [string, string] => Boolean(entry[1])))
      const zip = buildRetailProjectZip({ project, images, qualityReports, layout, batchStartIndex: project.batchStartIndex })
      downloadRetailProjectZip(zip, project, layout)
      showToast(layout === 'meituan-batch' ? '批量上传包已导出' : '商品图片包已导出', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出失败', 'error')
    } finally {
      setExporting(false)
    }
  }

  const loadProjectSources = async (target: RetailProject): Promise<InputImage[]> => {
    const entries = await Promise.all(target.sourceImageIds.map(async (id) => [id, await getImage(id)] as const))
    return entries.flatMap(([id, image]) => (image?.dataUrl ? [{ id, dataUrl: image.dataUrl }] : []))
  }

  const handleBatchImport = async (files: File[]) => {
    const { groups, unmatched } = groupRetailBatchFiles(files)
    if (groups.length === 0) {
      showToast('文件名里没识别到条码，请用「条码.jpg」这样的命名', 'error')
      return
    }
    setBatchRunning(true)
    try {
      const created: RetailProject[] = []
      for (const group of groups) {
        const stored = await Promise.all(group.files.slice(0, 8).map(async (file) => {
          const dataUrl = await readFileAsDataUrl(file)
          return { id: await storeImage(dataUrl, 'upload'), dataUrl }
        }))
        const next = createRetailProject()
        next.sourceImageIds = stored.map((image) => image.id)
        next.sourceImageRoles = Object.fromEntries(stored.map((image) => [image.id, 'product' as const]))
        next.product = { ...next.product, barcode: group.barcode }
        next.platformPresetId = projectRef.current.platformPresetId
        next.styleId = projectRef.current.styleId
        next.concurrency = projectRef.current.concurrency
        next.batchStartIndex = projectRef.current.batchStartIndex

        const record = await lookupRetailCatalogProduct(group.barcode)
        if (record) next.product = applyRetailCatalogRecord(next.product, record, next.product.platform).product
        next.title = next.product.name || group.barcode

        await putRetailProject(next)
        created.push(next)
      }
      setProjects((current) => [...created, ...current].sort((a, b) => b.updatedAt - a.updatedAt))
      const filled = created.filter((item) => item.product.name.trim()).length
      showToast(
        `已建立 ${created.length} 个商品项目，${filled} 个从主档带出了资料`
        + (unmatched.length ? `，${unmatched.length} 个文件没识别到条码` : ''),
        'success',
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : '批量导入失败', 'error')
    } finally {
      setBatchRunning(false)
    }
  }

  const handleBatchGenerate = async () => {
    if (generating || batchRunning) return
    const runnable = projects.filter((item) => {
      const itemArchetype = resolveArchetype(item.product)
      return validateRetailProduct(item.product, itemArchetype).valid
        && item.sourceImageIds.some((id) => (item.sourceImageRoles[id] ?? 'product') === 'product')
    })
    if (runnable.length === 0) {
      showToast('没有资料齐全且带原图的商品项目', 'error')
      return
    }

    setBatchRunning(true)
    setBatchProgress({ done: 0, total: runnable.length, failed: 0 })
    let failedImages = 0
    try {
      for (const [index, item] of runnable.entries()) {
        setBatchProgress({ done: index, total: runnable.length, failed: failedImages })
        const sources = await loadProjectSources(item)
        if (sources.length === 0) continue
        let working: RetailProject = { ...item, slots: item.slots.map((slot) => ({ ...slot })) }
        const { failed, plans: itemPlans } = await runProjectQueue({
          project: working,
          sources,
          // 批量项目还没算过 plans，交给 runProjectQueue 现算，这里只排除已完成的图片位
          slotIds: RETAIL_SLOT_IDS.filter((slotId) => working.slots.find((slot) => slot.slotId === slotId)?.status !== 'done'),
          onSlot: (slotId, patch) => {
            working = {
              ...working,
              slots: working.slots.map((slot) => (slot.slotId === slotId ? { ...slot, ...patch } : slot)),
              updatedAt: Date.now(),
            }
            if (projectRef.current.id === working.id) updateSlot(slotId, patch)
          },
        })
        failedImages += failed
        working = { ...working, plans: itemPlans }
        await putRetailProject(working)
        setProjects((current) => current.map((entry) => (entry.id === working.id ? working : entry)))
      }
      setBatchProgress({ done: runnable.length, total: runnable.length, failed: failedImages })
      showToast(
        failedImages ? `批量生成完成，${failedImages} 张失败可单独重试` : `${runnable.length} 个商品全部生成完成`,
        failedImages ? 'error' : 'success',
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : '批量生成中断', 'error')
    } finally {
      setBatchRunning(false)
    }
  }

  const handleBatchExport = async (layout: RetailExportLayout) => {
    setExporting(true)
    try {
      const entries: RetailBatchExportEntry[] = []
      for (const item of projects) {
        const ids = item.slots.flatMap((slot) => [slot.composedImageId, slot.outputImageId]).filter((id): id is string => Boolean(id))
        if (ids.length === 0) continue
        const loaded = await Promise.all(ids.map(async (id) => [id, await ensureImageCached(id)] as const))
        const images = Object.fromEntries(loaded.filter((entry): entry is [string, string] => Boolean(entry[1])))
        if (Object.keys(images).length === 0) continue
        const itemPreset = getRetailPlatformPreset(item.platformPresetId)
        const itemArchetype = resolveArchetype(item.product)
        const itemValid = validateRetailProduct(item.product, itemArchetype).valid
        const reports = Object.fromEntries(item.slots.map((slot) => {
          const plan = item.plans.find((entry) => entry.id === slot.slotId)
          const imageId = slot.composedImageId || slot.outputImageId
          return [slot.slotId, evaluateRetailSlotQuality({
            slotId: slot.slotId,
            imageId,
            metadata: imageId ? imageMetadata[imageId] ?? null : null,
            copyLines: plan?.copyLines ?? [],
            preset: itemPreset,
            productValid: itemValid,
          })]
        })) as Partial<Record<RetailSlotId, RetailQualityReport>>
        entries.push({ project: item, images, qualityReports: reports })
      }
      if (entries.length === 0) {
        showToast('还没有已生成图片的商品项目', 'error')
        return
      }
      if (layout === 'meituan-batch') {
        const missing = entries.filter((entry) => !entry.project.product.sku.trim())
        if (missing.length > 0) {
          showToast(
            `${missing.length} 个商品还没填货号（店内码）：${missing.slice(0, 3).map((entry) => entry.project.product.name || entry.project.product.barcode).join('、')}${missing.length > 3 ? '…' : ''}`,
            'error',
          )
          return
        }
      }
      const zip = buildRetailBatchZip(entries, layout, project.batchStartIndex)
      downloadRetailBatchZip(zip, entries.length, layout)
      showToast(`已导出 ${entries.length} 个商品的${layout === 'meituan-batch' ? '批量上传包' : '图片包'}`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '批量导出失败', 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleNewProject = () => {
    const next = createRetailProject()
    setProjects((current) => [next, ...current])
    setProject(next)
    setSourceImages([])
    setMobileTab('product')
  }

  const handleDeleteProject = () => {
    setConfirmDialog({
      title: '删除商品项目',
      message: `确定删除「${project.title}」吗？历史生成任务仍会保留。`,
      confirmText: '删除项目',
      tone: 'danger',
      action: async () => {
        await deleteRetailProject(project.id)
        const remaining = projects.filter((item) => item.id !== project.id)
        const next = remaining[0] ?? createRetailProject()
        if (remaining.length === 0) await putRetailProject(next)
        setProjects(remaining.length > 0 ? remaining : [next])
        setProject(next)
      },
    })
  }

  const handleOpenImage = (slot: RetailProjectSlot) => {
    const imageId = resolveSlotImageId(slot)
    if (!imageId) return
    const list = project.slots.map(resolveSlotImageId).filter((id): id is string => Boolean(id))
    setLightboxImageId(imageId, list)
  }

  if (!loaded) {
    return <main className="retail-loading"><span /><p>正在载入商品类目知识</p></main>
  }

  return (
    <main className="retail-workspace" data-home-main>
      <div className="retail-project-toolbar" data-no-drag-select>
        <div className="retail-project-picker">
          <PackageSearch size={18} />
          <select value={project.id} onChange={(event) => {
            const next = projects.find((item) => item.id === event.target.value)
            if (next) setProject(normalizeRetailProject(next))
          }}>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </div>
        <div className="retail-toolbar-actions">
          <button type="button" title="新建商品" aria-label="新建商品" onClick={handleNewProject}><FilePlus2 size={17} /></button>
          <button type="button" title="删除商品项目" aria-label="删除商品项目" disabled={generating} onClick={handleDeleteProject}><Trash2 size={17} /></button>
          <button type="button" className="retail-history-button" onClick={() => setShowHistory(true)}><Clock3 size={17} /><span>历史</span></button>
        </div>
      </div>

      <nav className="retail-flow" aria-label="工作流程">
        {['商品原图', '商品资料', '平台风格', '图集生成', '内部质检', 'SKU 导出'].map((label, index) => {
          const active = index < 2 ? sourceImages.length > 0 && (index === 0 || productValidation.valid) : index === 2 ? canGenerate : index === 3 ? completed > 0 : index === 4 ? completed === 7 : false
          return <div key={label} className={active ? 'is-complete' : ''}><span>{index + 1}</span><b>{label}</b></div>
        })}
      </nav>

      <div className="retail-mobile-tabs" role="tablist">
        <button type="button" className={mobileTab === 'product' ? 'is-active' : ''} onClick={() => setMobileTab('product')}><PackageSearch size={16} />商品</button>
        <button type="button" className={mobileTab === 'images' ? 'is-active' : ''} onClick={() => setMobileTab('images')}><Images size={16} />图集 <span>{completed}/7{specialDone ? '+1' : ''}</span></button>
        <button type="button" className={mobileTab === 'quality' ? 'is-active' : ''} onClick={() => setMobileTab('quality')}><ShieldCheck size={16} />质检</button>
      </div>

      <div className="retail-layout">
        <aside className={`retail-left-panel ${mobileTab === 'product' ? 'is-mobile-active' : ''}`}>
          <SourceUploader
            images={sourceImages}
            roles={sourceImageRoles}
            disabled={generating}
            onFiles={handleFiles}
            onRemove={handleRemoveSource}
            onRoleChange={handleSourceRoleChange}
          />
          <ProductPanel
            product={project.product}
            archetype={archetype}
            category={categoryMatch?.category ?? null}
            knowledge={knowledge}
            issues={[...productValidation.errors, ...productValidation.warnings]}
            disabled={generating}
            onChange={handleProductChange}
          />
          <SpecialImageControls
            evaluation={specialEvaluation}
            value={project.specialImageType}
            disabled={generating}
            onChange={(specialImageType) => updateProject((current) => ({
              ...current,
              specialImageType,
              slots: current.slots.map(clearSpecialSlot),
              updatedAt: Date.now(),
            }))}
          />
          <PlatformControls
            platformPresetId={project.platformPresetId}
            styleId={project.styleId}
            concurrency={project.concurrency}
            disabled={generating}
            onPlatformPresetChange={(id) => {
              const nextPreset = getRetailPlatformPreset(id)
              updateProject((current) => ({ ...current, platformPresetId: id, product: { ...current.product, platform: nextPreset.platform }, updatedAt: Date.now() }))
            }}
            onStyleChange={(styleId) => updateProject((current) => ({ ...current, styleId, updatedAt: Date.now() }))}
            onConcurrencyChange={(concurrency) => updateProject((current) => ({ ...current, concurrency, updatedAt: Date.now() }))}
          />
        </aside>

        <div className={`retail-center-panel ${mobileTab === 'images' ? 'is-mobile-active' : ''}`}>
          <PlanBoard
            plans={plans}
            slots={project.slots}
            previews={previews}
            generating={generating}
            paused={project.queuePaused}
            canGenerate={canGenerate}
            onGenerateAll={handleGenerateAll}
            onPauseToggle={handlePauseToggle}
            onGenerateSlot={(slotId) => startQueue([slotId])}
            onOpenImage={handleOpenImage}
          />
        </div>

        <div className={`retail-right-panel ${mobileTab === 'quality' ? 'is-mobile-active' : ''}`}>
          <BatchPanel
            projectCount={projects.length}
            running={batchRunning || generating}
            exporting={exporting}
            progress={batchProgress}
            onImport={(files) => void handleBatchImport(files)}
            onGenerate={() => void handleBatchGenerate()}
            onExport={(layout) => void handleBatchExport(layout)}
          />
          <QualityPanel
            project={project}
            productIssues={[...productValidation.errors, ...productValidation.warnings]}
            reports={qualityReports}
            exporting={exporting}
            onExport={handleExport}
            onBatchStartIndexChange={(batchStartIndex) => updateProject((current) => ({ ...current, batchStartIndex, updatedAt: Date.now() }))}
          />
        </div>
      </div>

      <ProgressDock completed={completed} specialDone={specialDone} generating={generating} paused={project.queuePaused} canGenerate={canGenerate} onGenerate={handleGenerateAll} onPauseToggle={handlePauseToggle} onExport={handleExport} />
      {showHistory && <Suspense fallback={null}><RetailHistoryDialog onClose={() => setShowHistory(false)} /></Suspense>}
    </main>
  )
}
