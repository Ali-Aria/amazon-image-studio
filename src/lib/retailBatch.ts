import { zipSync, strToU8 } from 'fflate'
import type { RetailProject, RetailSlotId } from '../types'
import type { RetailQualityReport } from './retailQuality'
import { collectRetailProjectFiles, safeRetailFileSegment, type RetailExportLayout } from './retailExporter'
import { normalizeRetailBarcode } from './retailCatalog'

export interface RetailBatchFileGroup {
  barcode: string
  files: File[]
}

/**
 * 从文件名取条码：支持 6941876270606.jpg、6941876270606_1.jpg、6941876270606-正面.png。
 * 取第一段连续的数字/字母，长度不足 6 位当作没带条码。
 */
export function parseBarcodeFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, '')
  const head = base.split(/[^0-9A-Za-z]/).find((segment) => segment.length > 0) ?? ''
  const normalized = normalizeRetailBarcode(head)
  return normalized.length >= 6 ? normalized : null
}

/**
 * 取文件名里条码之后的序号，用来决定同一商品内的图片顺序。
 * 不带序号的（6941876270606.jpg）算 0，也就是主图排最前。
 */
export function batchFileOrder(fileName: string): number {
  const base = fileName.replace(/\.[^.]+$/, '')
  const suffix = base.replace(/^[0-9A-Za-z]+/, '')
  const digits = suffix.match(/\d+/)
  return digits ? Number(digits[0]) : suffix.trim() ? Number.MAX_SAFE_INTEGER : 0
}

/** 按条码把上传的图片分组，同一条码的多张图按序号归到一个商品，主图排最前 */
export function groupRetailBatchFiles(files: File[]): { groups: RetailBatchFileGroup[]; unmatched: File[] } {
  const groups = new Map<string, File[]>()
  const unmatched: File[] = []
  const ordered = [...files].sort((a, b) => {
    const orderDiff = batchFileOrder(a.name) - batchFileOrder(b.name)
    return orderDiff !== 0 ? orderDiff : a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true })
  })

  for (const file of ordered) {
    const barcode = parseBarcodeFromFileName(file.name)
    if (!barcode) {
      unmatched.push(file)
      continue
    }
    const current = groups.get(barcode)
    if (current) current.push(file)
    else groups.set(barcode, [file])
  }

  return {
    groups: [...groups.entries()].map(([barcode, groupFiles]) => ({ barcode, files: groupFiles })),
    unmatched,
  }
}

export interface RetailBatchExportEntry {
  project: RetailProject
  images: Record<string, string>
  qualityReports: Partial<Record<RetailSlotId, RetailQualityReport>>
}

/** 多商品打成一个总包，每个商品一个以货号命名的子目录 */
export function buildRetailBatchZip(entries: RetailBatchExportEntry[], layout: RetailExportLayout, batchStartIndex = 1) {
  const files: Record<string, Uint8Array> = {}
  const summary: Array<{ sku: string; name: string; files: number }> = []
  const usedRoots = new Set<string>()

  for (const entry of entries) {
    const identity = entry.project.product.sku || entry.project.product.barcode || 'NO-SKU'
    let root = `${safeRetailFileSegment(identity)}_${safeRetailFileSegment(entry.project.product.name)}`
    let suffix = 2
    while (usedRoots.has(root)) root = `${root}_${suffix++}`
    usedRoots.add(root)

    const projectFiles = collectRetailProjectFiles({
      project: entry.project,
      images: entry.images,
      qualityReports: entry.qualityReports,
      layout,
      batchStartIndex,
      root: `${root}/`,
    })
    Object.assign(files, projectFiles)
    summary.push({
      sku: identity,
      name: entry.project.product.name,
      files: Object.keys(projectFiles).filter((path) => !path.endsWith('.json') && !path.endsWith('.txt')).length,
    })
  }

  files['批量导出清单.json'] = strToU8(JSON.stringify({
    exportLayout: layout,
    batchStartIndex,
    productCount: summary.length,
    products: summary,
  }, null, 2))

  return zipSync(files, { level: 6 })
}

export function downloadRetailBatchZip(bytes: Uint8Array, count: number, layout: RetailExportLayout) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `批量${layout === 'meituan-batch' ? '上传包' : '商品图'}_${count}个商品.zip`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
