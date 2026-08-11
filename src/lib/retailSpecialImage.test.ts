import { describe, expect, it } from 'vitest'
import type { RetailArchetype, RetailProduct } from '../types'
import { createEmptyRetailProduct } from './retailProduct'
import { evaluateRetailSpecialImage } from './retailSpecialImage'

function archetype(id: RetailArchetype['id'], label: string): RetailArchetype {
  return {
    id,
    label,
    match_keywords: [],
    required_facts: [],
    slot_plan: [],
    forbidden: [],
  }
}

function product(overrides: Partial<RetailProduct> = {}): RetailProduct {
  return {
    ...createEmptyRetailProduct(),
    name: '元气森林白桃味气泡水',
    categoryPath: '饮品>饮料>气泡水',
    archetypeId: 'beverage',
    brand: '元气森林',
    sku: 'DRINK-001',
    saleSpecification: '480ml/瓶',
    saleUnit: '瓶',
    netContent: '480ml',
    packageForm: '塑料瓶',
    flavor: '白桃味',
    storage: '阴凉干燥处保存',
    ...overrides,
  }
}

describe('platform special image policy', () => {
  it('routes a verified beverage to a product facts card', () => {
    const result = evaluateRetailSpecialImage({
      product: product(),
      archetype: archetype('beverage', '饮料乳品'),
      sourceImageRoles: { 'image-product': 'product' },
      preferredType: 'auto',
    })

    expect(result).toMatchObject({
      selectedType: 'product_facts',
      state: 'ready',
      processingMode: 'deterministic',
      allowAiGeneration: false,
    })
    expect(result.copyLines).toEqual(expect.arrayContaining([
      '品牌｜元气森林',
      '净含量｜480ml',
      '售卖规格｜480ml/瓶',
    ]))
  })

  it('routes electronics with verified dimensions to a dimension card', () => {
    const result = evaluateRetailSpecialImage({
      product: product({
        name: '便携电热水壶',
        categoryPath: '家用电器>厨房小电>电热水壶',
        archetypeId: 'electronics',
        attributes: { 产品尺寸: '160×110×220mm', 额定功率: '800W' },
      }),
      archetype: archetype('electronics', '家用电器'),
      sourceImageRoles: { 'image-product': 'product' },
      preferredType: 'auto',
    })

    expect(result.selectedType).toBe('dimension')
    expect(result.copyLines).toEqual(expect.arrayContaining([
      '产品尺寸｜160×110×220mm',
      '额定功率｜800W',
    ]))
  })

  it('routes apparel with verified size mapping to a size guide', () => {
    const result = evaluateRetailSpecialImage({
      product: product({
        name: '女士圆领短袖',
        categoryPath: '服饰鞋包>女装>短袖',
        archetypeId: 'apparel_textile',
        attributes: { 尺码: 'M', 适用体重: '45-55kg' },
      }),
      archetype: archetype('apparel_textile', '服饰鞋包'),
      sourceImageRoles: { 'image-product': 'product' },
      preferredType: 'auto',
    })

    expect(result.selectedType).toBe('size_guide')
    expect(result.copyLines).toEqual(['尺码｜M', '适用体重｜45-55kg'])
  })

  it('does not use derived or unconfirmed OCR facts as visible copy', () => {
    const input = product({
      attributes: { 原产地: '法国', 酒精度: '12%vol', 适用温度: '8-12℃' },
      factSources: { 原产地: 'derived', 酒精度: 'ocr', 适用温度: 'ocr' },
      factVerification: { 适用温度: true },
    })
    const result = evaluateRetailSpecialImage({
      product: input,
      archetype: archetype('beverage', '饮料乳品'),
      sourceImageRoles: { 'image-product': 'product' },
      preferredType: 'product_facts',
    })

    expect(result.copyLines.join(' ')).not.toContain('法国')
    expect(result.copyLines.join(' ')).not.toContain('12%vol')
    expect(result.copyLines.join(' ')).toContain('8-12℃')
  })

  it('requires a real gift package image before enabling gift pack generation', () => {
    const noGiftImage = evaluateRetailSpecialImage({
      product: product({ name: '七夕巧克力礼盒', categoryPath: '休闲食品>巧克力>礼盒' }),
      archetype: archetype('packaged_food', '包装食品'),
      sourceImageRoles: { 'image-product': 'product' },
      preferredType: 'gift_pack',
    })
    const withGiftImage = evaluateRetailSpecialImage({
      product: product({ name: '七夕巧克力礼盒', categoryPath: '休闲食品>巧克力>礼盒' }),
      archetype: archetype('packaged_food', '包装食品'),
      sourceImageRoles: { 'image-product': 'product', 'image-gift': 'gift_pack' },
      preferredType: 'gift_pack',
    })

    expect(noGiftImage.state).toBe('ready')
    expect(noGiftImage.selectedType).toBe('product_facts')
    expect(noGiftImage.options.find((option) => option.type === 'gift_pack')).toMatchObject({ state: 'needs-upload' })
    expect(withGiftImage).toMatchObject({
      selectedType: 'gift_pack',
      state: 'ready',
      processingMode: 'ai-preserve',
      requiredSourceRole: 'gift_pack',
    })
  })

  it('marks certificates as upload-only and never AI-generatable', () => {
    const result = evaluateRetailSpecialImage({
      product: product({ archetypeId: 'health_medical', categoryPath: '医疗器械>护理器械' }),
      archetype: archetype('health_medical', '健康医疗'),
      sourceImageRoles: { 'image-product': 'product', 'image-document': 'authentic_document' },
      preferredType: 'authentic_document',
    })

    expect(result).toMatchObject({
      selectedType: 'authentic_document',
      state: 'ready',
      processingMode: 'source-only',
      allowAiGeneration: false,
      requiredSourceRole: 'authentic_document',
    })
  })

  it('keeps a missing medical certificate upload-only and falls back safely', () => {
    const result = evaluateRetailSpecialImage({
      product: product({ archetypeId: 'health_medical', categoryPath: '医疗器械>护理器械' }),
      archetype: archetype('health_medical', '健康医疗'),
      sourceImageRoles: { 'image-product': 'product' },
      preferredType: 'authentic_document',
    })

    expect(result.selectedType).toBe('product_facts')
    expect(result.options.find((option) => option.type === 'authentic_document')).toMatchObject({
      state: 'needs-upload',
      processingMode: 'source-only',
      allowAiGeneration: false,
    })
  })

  it('falls back from an invalid manual choice to the best eligible type', () => {
    const result = evaluateRetailSpecialImage({
      product: product(),
      archetype: archetype('beverage', '饮料乳品'),
      sourceImageRoles: { 'image-product': 'product' },
      preferredType: 'dimension',
    })

    expect(result.selectedType).toBe('product_facts')
    expect(result.state).toBe('ready')
    expect(result.options.find((option) => option.type === 'dimension')?.state).toBe('needs-fields')
  })
})
