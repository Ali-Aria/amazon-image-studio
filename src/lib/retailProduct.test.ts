import { describe, expect, it } from 'vitest'
import type { RetailArchetype, RetailProduct } from '../types'
import { createEmptyRetailProduct, validateRetailProduct } from './retailProduct'

const alcohol: RetailArchetype = {
  id: 'alcohol',
  label: '酒水',
  match_keywords: ['酒水'],
  required_facts: ['商品名称', '品牌', '酒精度', '净含量', '包装形态', '售卖规格', '储存方式'],
  slot_plan: [],
  forbidden: [],
}

function validAlcohol(): RetailProduct {
  return {
    ...createEmptyRetailProduct(),
    name: 'RIO 微醺白桃味鸡尾酒',
    platform: 'meituan',
    categoryPath: '酒类>预调酒>鸡尾酒',
    archetypeId: 'alcohol',
    brand: 'RIO',
    sku: 'SKU-001',
    saleSpecification: '330ml/罐',
    saleUnit: '罐',
    netContent: '330ml',
    packageForm: '易拉罐',
    storage: '阴凉干燥处保存',
    attributes: { 酒精度: '3%vol', 口味: '白桃味' },
  }
}

describe('retail product facts', () => {
  it('requires actual identifiers and core upload facts', () => {
    const result = validateRetailProduct(createEmptyRetailProduct(), alcohol)

    expect(result.errors.map((issue) => issue.field)).toEqual(expect.arrayContaining([
      'name',
      'categoryPath',
      'brand',
      'identity',
      'saleSpecification',
      'saleUnit',
      'netContent',
      'packageForm',
    ]))
  })

  it('requires alcohol percentage for alcohol but accepts SKU instead of barcode', () => {
    const product = validAlcohol()
    delete product.attributes['酒精度']

    const missing = validateRetailProduct(product, alcohol)
    expect(missing.errors.some((issue) => issue.label === '酒精度')).toBe(true)

    product.attributes['酒精度'] = '3%vol'
    const complete = validateRetailProduct(product, alcohol)
    expect(complete.errors).toHaveLength(0)
  })

  it('does not promote unconfirmed free text into structured facts', () => {
    const product = validAlcohol()
    product.description = '据说低糖，适合所有人群'
    product.factSources = { 酒精度: 'package' }

    const result = validateRetailProduct(product, alcohol)
    expect(result.confirmedFacts['酒精度']).toBe('3%vol')
    expect(result.confirmedFacts['是否含糖']).toBeUndefined()
    expect(result.warnings.some((issue) => issue.code === 'unverified-description')).toBe(true)
  })
})
