import type { RetailFactSource, RetailPlatformId, RetailProduct } from '../types'
import { RETAIL_FACT_FIELD_MAP } from './retailProduct'

export interface RetailCatalogRecord {
  barcode: string
  name: string
  brand: string
  saleSpecification: string
  saleUnit: string
  netContent: string
  mtCategoryPath: string
  elemeCategoryPath: string
  attributes: Record<string, string>
  mainImageCount: number
  detailImageCount: number
  specialImageCount: number
  specType: string
  skuId: string
}

export interface RetailCatalogMeta {
  schemaVersion: number
  generatedAt: string
  sourceFile: string
  sourceSha256: string
  rowsScanned: number
  keyCount: number
  shardCount: number
  shardKeyLength: number
}

interface RawCatalogRecord {
  n?: string
  b?: string
  s?: string
  u?: string
  w?: string
  mc?: string
  ec?: string
  a?: Record<string, string>
  im?: number
  id?: number
  is?: number
  t?: string
  bc?: string
  sk?: string
}

const CATALOG_PATH = 'knowledge/product-index'

function basePath() {
  return import.meta.env.BASE_URL || './'
}

/** 条码只保留数字与字母，扫码枪常带回车和空格 */
export function normalizeRetailBarcode(value: string) {
  return value.normalize('NFKC').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

export function retailCatalogShardKey(barcode: string) {
  const normalized = normalizeRetailBarcode(barcode)
  return normalized.slice(-2).padStart(2, '0')
}

function toRecord(barcode: string, raw: RawCatalogRecord): RetailCatalogRecord {
  return {
    barcode: raw.bc || barcode,
    name: raw.n ?? '',
    brand: raw.b ?? '',
    saleSpecification: raw.s ?? '',
    saleUnit: raw.u ?? '',
    netContent: raw.w ?? '',
    mtCategoryPath: raw.mc ?? '',
    elemeCategoryPath: raw.ec ?? '',
    attributes: raw.a ?? {},
    mainImageCount: raw.im ?? 0,
    detailImageCount: raw.id ?? 0,
    specialImageCount: raw.is ?? 0,
    specType: raw.t ?? '',
    skuId: raw.sk ?? '',
  }
}

let cachedMeta: Promise<RetailCatalogMeta | null> | null = null
const shardCache = new Map<string, Promise<Record<string, RawCatalogRecord> | null>>()

/** 索引资产是本地生成的经营数据，不在仓库里；缺失时返回 null，调用方据此关闭条码带出 */
export function loadRetailCatalogMeta(): Promise<RetailCatalogMeta | null> {
  if (!cachedMeta) {
    cachedMeta = fetch(`${basePath()}${CATALOG_PATH}/index.meta.json`)
      .then((response) => (response.ok ? (response.json() as Promise<RetailCatalogMeta>) : null))
      .catch(() => null)
  }
  return cachedMeta
}

function loadShard(shard: string) {
  const cached = shardCache.get(shard)
  if (cached) return cached
  const request = fetch(`${basePath()}${CATALOG_PATH}/v1/${shard}.json`)
    .then((response) => (response.ok ? response.json() : null))
    .then((payload: { items?: Record<string, RawCatalogRecord> } | null) => payload?.items ?? null)
    .catch(() => null)
  shardCache.set(shard, request)
  return request
}

export async function lookupRetailCatalogProduct(barcode: string): Promise<RetailCatalogRecord | null> {
  const normalized = normalizeRetailBarcode(barcode)
  if (normalized.length < 6) return null
  const items = await loadShard(retailCatalogShardKey(normalized))
  const raw = items?.[normalized]
  return raw ? toRecord(normalized, raw) : null
}

export interface ApplyCatalogResult {
  product: RetailProduct
  filled: string[]
  skipped: string[]
}

/**
 * 把主档记录填进商品资料，只填空位、不覆盖已填内容，来源统一标 pool。
 * 覆盖用户已确认的值会让「资料来源可信」这条前提失效，所以这里永远不做覆盖。
 */
export function applyRetailCatalogRecord(
  product: RetailProduct,
  record: RetailCatalogRecord,
  platform: RetailPlatformId,
): ApplyCatalogResult {
  const next: RetailProduct = {
    ...product,
    attributes: { ...product.attributes },
    factSources: { ...product.factSources },
    factVerification: { ...product.factVerification },
  }
  const filled: string[] = []
  const skipped: string[] = []
  const source: RetailFactSource = 'pool'

  const setField = (field: keyof RetailProduct, label: string, value: string) => {
    if (!value.trim()) return
    const current = next[field]
    if (typeof current !== 'string') return
    if (current.trim()) {
      if (current.trim() !== value.trim()) skipped.push(label)
      return
    }
    ;(next as unknown as Record<string, unknown>)[field] = value.trim()
    next.factSources[label] = source
    filled.push(label)
  }

  setField('name', '商品名称', record.name)
  setField('brand', '品牌', record.brand)
  setField('barcode', '条码', record.barcode)
  setField('saleSpecification', '售卖规格', record.saleSpecification)
  setField('saleUnit', '售卖单位', record.saleUnit)
  setField('netContent', '净含量', record.netContent)
  setField(
    'categoryPath',
    '平台类目',
    platform === 'meituan' ? record.mtCategoryPath : record.elemeCategoryPath || record.mtCategoryPath,
  )

  for (const [label, value] of Object.entries(record.attributes)) {
    if (!value.trim()) continue
    const field = RETAIL_FACT_FIELD_MAP[label]
    if (field) {
      setField(field, label, value)
      continue
    }
    if (next.attributes[label]?.trim()) {
      if (next.attributes[label].trim() !== value.trim()) skipped.push(label)
      continue
    }
    next.attributes[label] = value.trim()
    next.factSources[label] = source
    filled.push(label)
  }

  return { product: next, filled, skipped }
}
