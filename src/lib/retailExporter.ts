import { strToU8, zipSync } from 'fflate'
import type { RetailProject, RetailSlotId } from '../types'
import type { RetailQualityReport } from './retailQuality'
import { RETAIL_BASE_SLOT_IDS } from './retailPlanner'
import { RETAIL_SPECIAL_IMAGE_LABELS } from './retailSpecialImage'

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

export function buildRetailProjectZip(input: {
  project: RetailProject
  images: Record<string, string>
  qualityReports: Partial<Record<RetailSlotId, RetailQualityReport>>
}) {
  const { project, images, qualityReports } = input
  const identity = project.product.sku || project.product.barcode || 'NO-SKU'
  const root = `${safeRetailFileSegment(identity)}_${safeRetailFileSegment(project.product.name)}/`
  const files: Record<string, Uint8Array> = {}
  const specialPlan = project.plans.find((plan) => plan.id === '08-special')
  const selectedType = specialPlan?.specialImageType
    ?? (project.specialImageType === 'auto' ? null : project.specialImageType)
  const specialLabel = selectedType ? RETAIL_SPECIAL_IMAGE_LABELS[selectedType] : '平台特殊图'

  for (const slot of project.slots) {
    if (slot.slotId === '08-special') {
      const report = qualityReports[slot.slotId]
      if (slot.status !== 'done' || !report || report.status === 'blocked') continue
    }
    const imageId = [slot.composedImageId, slot.outputImageId]
      .find((candidate): candidate is string => Boolean(candidate && images[candidate]))
    if (!imageId || !images[imageId]) continue
    const decoded = decodeDataUrl(images[imageId])
    const fileName = slot.slotId === '08-special'
      ? `08_特殊图_${safeRetailFileSegment(specialLabel)}`
      : SLOT_FILE_NAMES[slot.slotId]
    files[`${root}${fileName}.${extensionForMime(decoded.mime)}`] = decoded.bytes
  }

  files[`${root}manifest.json`] = strToU8(
    JSON.stringify(buildRetailExportManifest(project, qualityReports), null, 2),
  )
  return zipSync(files, { level: 6 })
}

export function downloadRetailProjectZip(bytes: Uint8Array, project: RetailProject) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const identity = project.product.sku || project.product.barcode || 'NO-SKU'
  anchor.href = url
  anchor.download = `${safeRetailFileSegment(identity)}_${safeRetailFileSegment(project.product.name)}_商品图.zip`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
