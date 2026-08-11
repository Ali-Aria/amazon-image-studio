import type { RetailPlatformPreset, RetailSlotId } from '../types'

export const RETAIL_PLATFORM_PRESETS: Record<string, RetailPlatformPreset> = {
  'meituan-square': {
    id: 'meituan-square',
    platform: 'meituan',
    label: '美团闪购 1:1',
    description: '商品主图 600×600，适合商品列表与详情图库',
    source: 'official',
    editable: false,
    main: { width: 600, height: 600 },
    gallery: { width: 600, height: 600 },
    detail: { width: 750, height: 2000 },
    maxBytes: 5 * 1024 * 1024,
    outputFormat: 'png',
  },
  'meituan-landscape': {
    id: 'meituan-landscape',
    platform: 'meituan',
    label: '美团闪购 4:3',
    description: '商品主图 600×450，适合横向商品素材',
    source: 'official',
    editable: false,
    main: { width: 600, height: 450 },
    gallery: { width: 600, height: 450 },
    detail: { width: 750, height: 2000 },
    maxBytes: 5 * 1024 * 1024,
    outputFormat: 'png',
  },
  'taobao-flash-square': {
    id: 'taobao-flash-square',
    platform: 'taobao_flash',
    label: '淘宝闪购 1:1',
    description: '业务默认方图，可按当前后台类目规则调整',
    source: 'business-default',
    editable: true,
    main: { width: 800, height: 800 },
    gallery: { width: 800, height: 800 },
    detail: { width: 750, height: 2000 },
    maxBytes: null,
    outputFormat: 'png',
  },
}

export function getRetailPlatformPreset(id: string): RetailPlatformPreset {
  return RETAIL_PLATFORM_PRESETS[id] ?? RETAIL_PLATFORM_PRESETS['meituan-square']
}

export function getRetailSlotOutputSize(presetId: string, slotId: RetailSlotId) {
  const preset = getRetailPlatformPreset(presetId)
  if (slotId === '07-detail-page') return { ...preset.detail }
  if (slotId === '01-main') return { ...preset.main }
  return { ...preset.gallery }
}

export function getRetailGenerationSize(presetId: string, slotId: RetailSlotId) {
  const size = getRetailSlotOutputSize(presetId, slotId)
  const ratio = size.width / size.height
  if (ratio > 1.18) return '1536x1024'
  if (ratio < 0.85) return '1024x1536'
  return '1024x1024'
}
