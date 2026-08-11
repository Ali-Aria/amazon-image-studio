import type { RetailPlatformPreset, RetailSlotId } from '../types'
import { getRetailSlotOutputSize } from './retailPlatform'

export interface RetailImageMetadata {
  width: number
  height: number
  bytes: number
}

export interface RetailQualityFinding {
  code: string
  severity: 'block' | 'warning'
  message: string
}

export interface RetailQualityReport {
  status: 'pass' | 'warning' | 'blocked'
  findings: RetailQualityFinding[]
}

interface EvaluateRetailSlotQualityInput {
  slotId: RetailSlotId
  imageId: string | null
  metadata: RetailImageMetadata | null
  copyLines: string[]
  preset: RetailPlatformPreset
  productValid: boolean
}

export function evaluateRetailSlotQuality(input: EvaluateRetailSlotQualityInput): RetailQualityReport {
  const findings: RetailQualityFinding[] = []
  const block = (code: string, message: string) => findings.push({ code, severity: 'block', message })
  const warn = (code: string, message: string) => findings.push({ code, severity: 'warning', message })

  if (!input.productValid) block('missing-facts', '商品关键信息未补齐')
  if (!input.imageId) {
    block('missing-output', '该图片位尚未生成')
  } else if (!input.metadata) {
    block('missing-metadata', '无法读取图片尺寸')
  } else {
    const target = getRetailSlotOutputSize(input.preset.id, input.slotId)
    if (input.metadata.width !== target.width || input.metadata.height !== target.height) {
      block('wrong-size', `图片应为 ${target.width}×${target.height}px`)
    }
    if (input.preset.maxBytes && input.metadata.bytes > input.preset.maxBytes) {
      block('file-too-large', `图片超过 ${(input.preset.maxBytes / 1024 / 1024).toFixed(0)}MB`)
    }
  }

  const copy = input.copyLines.join(' ')
  if (/满\s*\d+(?:\.\d+)?\s*减\s*\d+(?:\.\d+)?/.test(copy)) block('coupon-copy', '含具体优惠券或满减门槛')
  if (/(?:到手价|售价|价格|仅售)?\s*[¥￥]\s*\d/.test(copy)) block('price-copy', '含具体价格信息')
  if (/内部|质检|待补充|检查提示|操作说明|资料检查/.test(copy)) block('internal-copy', '含内部流程或待补充文案')
  if (/二维码|扫码|微信|手机号|联系电话/.test(copy)) block('contact-copy', '含二维码或联系方式相关文案')

  if (input.imageId && ['01-main', '02-front', '04-detail'].includes(input.slotId)) {
    warn('packaging-review', '请人工核对包装文字、品牌、规格、颜色与数量是否和原图一致')
  }

  const status = findings.some((finding) => finding.severity === 'block')
    ? 'blocked'
    : findings.some((finding) => finding.severity === 'warning')
      ? 'warning'
      : 'pass'
  return { status, findings }
}

export function dataUrlByteLength(dataUrl: string) {
  const payload = dataUrl.split(',')[1] ?? ''
  return Math.max(0, Math.floor(payload.length * 0.75) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0))
}
