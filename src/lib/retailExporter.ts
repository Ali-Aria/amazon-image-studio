import { strToU8, zipSync } from 'fflate'
import type { RetailProject, RetailSlotId } from '../types'
import type { RetailQualityReport } from './retailQuality'

const SLOT_FILE_NAMES: Record<RetailSlotId, string> = {
  '01-main': '01_主图',
  '02-front': '02_商品正面',
  '03-selling-points': '03_核心卖点',
  '04-detail': '04_商品细节',
  '05-scene': '05_使用场景',
  '06-specification': '06_规格信息',
  '07-detail-page': '07_详情长图',
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
  const complete = project.slots.every((slot) => slot.status === 'done' && Boolean(slot.composedImageId || slot.outputImageId))
  const blocked = Object.values(qualityReports).some((report) => report?.status === 'blocked')
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    exportStatus: complete && !blocked ? 'upload-ready' : 'draft',
    platformPresetId: project.platformPresetId,
    styleId: project.styleId,
    product: project.product,
    sourceImageIds: project.sourceImageIds,
    slots: project.slots.map((slot) => ({
      ...slot,
      fileName: `${SLOT_FILE_NAMES[slot.slotId]}.png`,
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

  for (const slot of project.slots) {
    const imageId = [slot.composedImageId, slot.outputImageId]
      .find((candidate): candidate is string => Boolean(candidate && images[candidate]))
    if (!imageId || !images[imageId]) continue
    const decoded = decodeDataUrl(images[imageId])
    files[`${root}${SLOT_FILE_NAMES[slot.slotId]}.${extensionForMime(decoded.mime)}`] = decoded.bytes
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
