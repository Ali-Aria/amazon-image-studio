import type { RetailPlatformPreset } from '../types'

export type RetailImageFormat = RetailPlatformPreset['outputFormat']

export interface RetailEncodeTarget {
  format: RetailImageFormat
  maxBytes: number | null
}

export interface RetailEncodedImage {
  dataUrl: string
  mime: string
  bytes: number
  quality: number | null
  /** 请求 PNG 但体积超限，已降级为有损格式 */
  downgraded: boolean
  withinBudget: boolean
}

/** 逐档降质，保证先试最高画质，超限才往下走 */
export const RETAIL_QUALITY_STEPS = [0.92, 0.86, 0.8, 0.72, 0.64, 0.55, 0.46] as const

const MIME_BY_FORMAT: Record<RetailImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export function retailImageExtension(mime: string) {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  return 'png'
}

export function dataUrlByteLength(dataUrl: string) {
  const payload = dataUrl.split(',')[1] ?? ''
  return Math.max(0, Math.floor(payload.length * 0.75) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0))
}

export function retailEncodeTargetFromPreset(preset: RetailPlatformPreset): RetailEncodeTarget {
  return { format: preset.outputFormat, maxBytes: preset.maxBytes }
}

type EncodeFn = (mime: string, quality?: number) => string

function measure(dataUrl: string, mime: string, quality: number | null, downgraded: boolean, maxBytes: number | null): RetailEncodedImage {
  const bytes = dataUrlByteLength(dataUrl)
  return { dataUrl, mime, bytes, quality, downgraded, withinBudget: maxBytes === null || bytes <= maxBytes }
}

/**
 * 把画布编码到平台体积上限以内：
 * - 无上限时按目标格式一次编码；
 * - 有损格式逐档降质，命中上限即停；
 * - PNG 超限时降级为 JPEG 再逐档降质；
 * - 全部档位都超限时返回体积最小的一版，并标记未达标交给质检拦截。
 */
export function encodeRetailImage(encode: EncodeFn, target: RetailEncodeTarget): RetailEncodedImage {
  const { maxBytes } = target
  const requestedMime = MIME_BY_FORMAT[target.format] ?? MIME_BY_FORMAT.png

  if (requestedMime === 'image/png') {
    const png = measure(encode('image/png'), 'image/png', null, false, maxBytes)
    if (png.withinBudget) return png
    const fallback = encodeLossy(encode, 'image/jpeg', maxBytes, true)
    return fallback.bytes < png.bytes ? fallback : png
  }

  return encodeLossy(encode, requestedMime, maxBytes, false)
}

function encodeLossy(encode: EncodeFn, mime: string, maxBytes: number | null, downgraded: boolean): RetailEncodedImage {
  let smallest: RetailEncodedImage | null = null
  for (const quality of RETAIL_QUALITY_STEPS) {
    const candidate = measure(encode(mime, quality), mime, quality, downgraded, maxBytes)
    if (candidate.withinBudget) return candidate
    if (!smallest || candidate.bytes < smallest.bytes) smallest = candidate
  }
  return smallest ?? measure(encode(mime, RETAIL_QUALITY_STEPS[0]), mime, RETAIL_QUALITY_STEPS[0], downgraded, maxBytes)
}
