import { describe, expect, it } from 'vitest'
import { RETAIL_PLATFORM_PRESETS } from './retailPlatform'
import { evaluateRetailSlotQuality } from './retailQuality'

describe('retail upload quality checks', () => {
  const preset = RETAIL_PLATFORM_PRESETS['meituan-square']

  it('blocks missing output and wrong final dimensions', () => {
    const missing = evaluateRetailSlotQuality({
      slotId: '01-main',
      imageId: null,
      metadata: null,
      copyLines: [],
      preset,
      productValid: true,
    })
    const wrongSize = evaluateRetailSlotQuality({
      slotId: '01-main',
      imageId: 'image-a',
      metadata: { width: 800, height: 800, bytes: 1000 },
      copyLines: [],
      preset,
      productValid: true,
    })

    expect(missing.status).toBe('blocked')
    expect(wrongSize.findings.some((finding) => finding.code === 'wrong-size')).toBe(true)
  })

  it('blocks concrete coupons, prices, and internal workflow copy', () => {
    const result = evaluateRetailSlotQuality({
      slotId: '03-selling-points',
      imageId: 'image-a',
      metadata: { width: 600, height: 600, bytes: 1000 },
      copyLines: ['满39减10', '到手价￥19.9', '待补充规格'],
      preset,
      productValid: true,
    })

    expect(result.status).toBe('blocked')
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'coupon-copy',
      'price-copy',
      'internal-copy',
    ]))
  })

  it('keeps packaging fidelity as an explicit human-review warning', () => {
    const result = evaluateRetailSlotQuality({
      slotId: '02-front',
      imageId: 'image-a',
      metadata: { width: 600, height: 600, bytes: 1000 },
      copyLines: [],
      preset,
      productValid: true,
    })

    expect(result.status).toBe('warning')
    expect(result.findings.some((finding) => finding.code === 'packaging-review')).toBe(true)
    expect(result.findings.some((finding) => finding.code === 'visual-compliance-review')).toBe(false)
  })

  it('keeps visual compliance as a single explicit review on the main image', () => {
    const result = evaluateRetailSlotQuality({
      slotId: '01-main',
      imageId: 'image-a',
      metadata: { width: 600, height: 600, bytes: 1000 },
      copyLines: [],
      preset,
      productValid: true,
    })

    expect(result.findings.some((finding) => finding.code === 'visual-compliance-review')).toBe(true)
  })
})
