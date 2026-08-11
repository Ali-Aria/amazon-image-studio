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

  it('does not block the base upload pack when an optional special image is ineligible', () => {
    const result = evaluateRetailSlotQuality({
      slotId: '08-special',
      imageId: null,
      metadata: null,
      copyLines: [],
      preset,
      productValid: true,
      special: {
        generationEligible: false,
        processingMode: 'deterministic',
        specialImageType: 'dimension',
        sourceRolePresent: true,
        trustedFacts: {},
      },
    })

    expect(result.status).not.toBe('blocked')
    expect(result.findings.some((finding) => finding.code === 'missing-output')).toBe(false)
  })

  it('treats an eligible but unfinished special image as an optional warning', () => {
    const result = evaluateRetailSlotQuality({
      slotId: '08-special',
      imageId: null,
      metadata: null,
      copyLines: ['净含量｜330ml'],
      preset,
      productValid: true,
      special: {
        generationEligible: true,
        processingMode: 'deterministic',
        specialImageType: 'product_facts',
        sourceRolePresent: true,
        trustedFacts: { 净含量: '330ml' },
      },
    })

    expect(result.status).toBe('warning')
    expect(result.findings).toEqual([
      expect.objectContaining({ code: 'special-not-generated', severity: 'warning' }),
    ])
  })

  it('blocks unverified visible fields in a special image', () => {
    const result = evaluateRetailSlotQuality({
      slotId: '08-special',
      imageId: 'special-a',
      metadata: { width: 600, height: 600, bytes: 1000 },
      copyLines: ['原产地｜法国', '净含量｜330ml'],
      preset,
      productValid: true,
      special: {
        generationEligible: true,
        processingMode: 'deterministic',
        specialImageType: 'product_facts',
        sourceRolePresent: true,
        trustedFacts: { 净含量: '330ml' },
      },
    })

    expect(result.status).toBe('blocked')
    expect(result.findings.some((finding) => finding.code === 'untrusted-special-copy')).toBe(true)
  })

  it('blocks authentic documents from any non-source-only processing path', () => {
    const result = evaluateRetailSlotQuality({
      slotId: '08-special',
      imageId: 'document-a',
      metadata: { width: 600, height: 600, bytes: 1000 },
      copyLines: [],
      preset,
      productValid: true,
      special: {
        generationEligible: true,
        processingMode: 'ai',
        specialImageType: 'authentic_document',
        sourceRolePresent: true,
        trustedFacts: {},
      },
    })

    expect(result.status).toBe('blocked')
    expect(result.findings.some((finding) => finding.code === 'document-ai-forbidden')).toBe(true)
  })

  it('requires the selected real source role for gift, label, and document images', () => {
    const result = evaluateRetailSlotQuality({
      slotId: '08-special',
      imageId: 'gift-a',
      metadata: { width: 600, height: 600, bytes: 1000 },
      copyLines: [],
      preset,
      productValid: true,
      special: {
        generationEligible: true,
        processingMode: 'ai-preserve',
        specialImageType: 'gift_pack',
        sourceRolePresent: false,
        trustedFacts: {},
      },
    })

    expect(result.status).toBe('blocked')
    expect(result.findings.some((finding) => finding.code === 'missing-special-source')).toBe(true)
  })
})
