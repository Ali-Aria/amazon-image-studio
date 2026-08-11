import { strToU8, zipSync } from 'fflate'
import type { RetailProject, RetailSlotId } from '../types'
import type { RetailQualityReport } from './retailQuality'
import { RETAIL_BASE_SLOT_IDS } from './retailPlanner'
import { RETAIL_SPECIAL_IMAGE_LABELS } from './retailSpecialImage'

/** readable：人读得懂的 01_主图 命名；meituan-batch：商家端批量传图认的 货号_编号 命名 */
export type RetailExportLayout = 'readable' | 'meituan-batch'

export interface RetailBatchFileEntry {
  slotId: RetailSlotId
  index: number
  fileName: string
}

export const RETAIL_BATCH_NOTES = [
  '美团商家端批量传图注意事项：',
  '1. 文件名前缀必须是商品的「货号 / 店内码」，也就是 wmProductSkus[0].sourceFoodCode。',
  '   平台自动生成的 mtcode_xxx 不是货号，用它整批都会匹配不上。',
  '2. 编号必须连续。「按编号替换对应位置」不接受跳号，只传 _3 会导致整批导入失败。',
  '3. 想在已有图片后面追加，必须把 _2 起的原有位置用商品自己的原图回填，新图放末位，',
  '   否则传 _2 只是替换第 2 张，张数不增加等于白传。',
  '4. 导入后核对预览表里「更新后 vs 原有」的张数是否真的增加，',
  '   不要只看「共识别 N 个商品」，那只证明货号匹配上了。',
].join('\n')

/**
 * 生成连续编号的批量文件名。跳号会让整批导入静默失败，所以编号由序号推导，
 * 不跟图片位序号绑定——被质检拦下的图片位不占编号。
 */
export function planRetailBatchUpload(input: {
  slotIds: RetailSlotId[]
  merchantCode: string
  startIndex: number
  extensionBySlot: Partial<Record<RetailSlotId, string>>
}): RetailBatchFileEntry[] {
  const prefix = safeRetailFileSegment(input.merchantCode)
  return input.slotIds.map((slotId, offset) => {
    const index = input.startIndex + offset
    return { slotId, index, fileName: `${prefix}_${index}.${input.extensionBySlot[slotId] ?? 'jpg'}` }
  })
}

const SLOT_FILE_NAMES: Record<RetailSlotId, string> = {
  '01-main': '01_主图',
  '02-front': '02_商品正面',
  '03-selling-points': '03_核心卖点',
  '04-detail': '04_商品细节',
  '05-scene': '05_使用场景',
  '06-specification': '06_规格信息',
  '07-detail-page': '07_详情长图',
  '08-special': '08_特殊图',
}

export function safeRetailFileSegment(value: string) {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_')
    .replace(/[._\s]+$/g, '')
    .replace(/_+/g, '_')
    .trim()
  return cleaned || '未命名'
}

export function buildRetailExportManifest(
  project: RetailProject,
  qualityReports: Partial<Record<RetailSlotId, RetailQualityReport>>,
) {
  const baseSlots = RETAIL_BASE_SLOT_IDS.map((slotId) => project.slots.find((slot) => slot.slotId === slotId))
  const complete = baseSlots.every((slot) => slot?.status === 'done' && Boolean(slot.composedImageId || slot.outputImageId))
  const blocked = RETAIL_BASE_SLOT_IDS.some((slotId) => qualityReports[slotId]?.status === 'blocked')
  const specialPlan = project.plans.find((plan) => plan.id === '08-special')
  const selectedType = specialPlan?.specialImageType
    ?? (project.specialImageType === 'auto' ? null : project.specialImageType)
  const specialLabel = selectedType ? RETAIL_SPECIAL_IMAGE_LABELS[selectedType] : '平台特殊图'
  const trustedFactLabels = specialPlan?.copyLines.flatMap((line) => {
    const separator = line.indexOf('｜')
    return separator > 0 ? [line.slice(0, separator).trim()] : []
  }) ?? []
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    exportStatus: complete && !blocked ? 'upload-ready' : 'draft',
    platformPresetId: project.platformPresetId,
    styleId: project.styleId,
    product: project.product,
    sourceImageIds: project.sourceImageIds,
    specialImage: {
      preferredType: project.specialImageType,
      selectedType,
      label: specialLabel,
      generationEligible: specialPlan?.generationEligible ?? false,
      processingMode: specialPlan?.processingMode ?? null,
      requiredSourceRole: specialPlan?.requiredSourceRole ?? null,
      sourceImageRoles: project.sourceImageRoles,
      trustedFactLabels,
    },
    slots: project.slots.map((slot) => ({
      ...slot,
      fileName: slot.slotId === '08-special'
        ? `08_特殊图_${safeRetailFileSegment(specialLabel)}.png`
        : `${SLOT_FILE_NAMES[slot.slotId]}.png`,
      quality: qualityReports[slot.slotId] ?? null,
    })),
  }
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)(?:;base64)?,(.*)$/s)
  if (!match) throw new Error('图片数据格式无效')
  const mime = match[1]
  const payload = match[2]
  const bytes = dataUrl.includes(';base64,')
    ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload))
  return { mime, bytes }
}

function extensionForMime(mime: string) {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  return 'png'
}

export interface CollectRetailProjectFilesInput {
  project: RetailProject
  images: Record<string, string>
  qualityReports: Partial<Record<RetailSlotId, RetailQualityReport>>
  layout?: RetailExportLayout
  /** 批量包起始编号：1 = 连主图一起整套替换，2 = 只补附图 */
  batchStartIndex?: number
  /** 多商品导出时的包内根目录，缺省用单商品的 SKU_名称 */
  root?: string
}

/** 收集单个商品在包里的所有文件，单商品导出和多商品总包共用 */
export function collectRetailProjectFiles(input: CollectRetailProjectFilesInput): Record<string, Uint8Array> {
  const { project, images, qualityReports } = input
  const layout = input.layout ?? 'readable'
  const identity = project.product.sku || project.product.barcode || 'NO-SKU'
  const root = input.root ?? `${safeRetailFileSegment(identity)}_${safeRetailFileSegment(project.product.name)}/`
  const files: Record<string, Uint8Array> = {}
  const specialPlan = project.plans.find((plan) => plan.id === '08-special')
  const selectedType = specialPlan?.specialImageType
    ?? (project.specialImageType === 'auto' ? null : project.specialImageType)
  const specialLabel = selectedType ? RETAIL_SPECIAL_IMAGE_LABELS[selectedType] : '平台特殊图'

  const included: Array<{ slotId: RetailSlotId; mime: string; bytes: Uint8Array }> = []
  for (const slot of project.slots) {
    if (slot.slotId === '08-special') {
      const report = qualityReports[slot.slotId]
      if (slot.status !== 'done' || !report || report.status === 'blocked') continue
    }
    const imageId = [slot.composedImageId, slot.outputImageId]
      .find((candidate): candidate is string => Boolean(candidate && images[candidate]))
    if (!imageId || !images[imageId]) continue
    const decoded = decodeDataUrl(images[imageId])
    included.push({ slotId: slot.slotId, mime: decoded.mime, bytes: decoded.bytes })
  }

  let batchPlan: RetailBatchFileEntry[] = []
  if (layout === 'meituan-batch') {
    // 批量传图按「货号 / 店内码」匹配商品，拿条码当前缀会一个都匹配不上、整批导入失败，
    // 所以货号缺失时宁可拦下来，也不给一个看着正常其实白传的包。
    const merchantCode = project.product.sku.trim()
    if (!merchantCode) {
      throw new Error(`「${project.product.name || identity}」缺少货号（店内码），批量上传包无法按货号命名`)
    }
    batchPlan = planRetailBatchUpload({
      slotIds: included.map((entry) => entry.slotId),
      merchantCode,
      startIndex: input.batchStartIndex ?? 1,
      extensionBySlot: Object.fromEntries(
        included.map((entry) => [entry.slotId, extensionForMime(entry.mime)]),
      ) as Partial<Record<RetailSlotId, string>>,
    })
    for (const entry of batchPlan) {
      const image = included.find((item) => item.slotId === entry.slotId)
      if (image) files[`${root}${entry.fileName}`] = image.bytes
    }
    files[`${root}批量导入说明.txt`] = strToU8(RETAIL_BATCH_NOTES)
  } else {
    for (const entry of included) {
      const fileName = entry.slotId === '08-special'
        ? `08_特殊图_${safeRetailFileSegment(specialLabel)}`
        : SLOT_FILE_NAMES[entry.slotId]
      files[`${root}${fileName}.${extensionForMime(entry.mime)}`] = entry.bytes
    }
  }

  const manifest = buildRetailExportManifest(project, qualityReports)
  files[`${root}manifest.json`] = strToU8(
    JSON.stringify({ ...manifest, exportLayout: layout, batchFiles: batchPlan }, null, 2),
  )
  return files
}

export function buildRetailProjectZip(input: CollectRetailProjectFilesInput) {
  return zipSync(collectRetailProjectFiles(input), { level: 6 })
}

export function downloadRetailProjectZip(bytes: Uint8Array, project: RetailProject, layout: RetailExportLayout = 'readable') {
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const identity = project.product.sku || project.product.barcode || 'NO-SKU'
  const suffix = layout === 'meituan-batch' ? '批量上传包' : '商品图'
  anchor.href = url
  anchor.download = `${safeRetailFileSegment(identity)}_${safeRetailFileSegment(project.product.name)}_${suffix}.zip`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
