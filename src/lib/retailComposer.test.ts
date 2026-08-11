import { describe, expect, it } from 'vitest'
import type { RetailImagePlan, RetailProduct, RetailSpecialImageType } from '../types'
import { buildRetailCompositionSpec } from './retailComposer'
import { createEmptyRetailProduct } from './retailProduct'

const product: RetailProduct = {
  ...createEmptyRetailProduct(),
  name: '可口可乐经典汽水',
  brand: '可口可乐',
  sku: 'COKE-330',
  categoryPath: '饮品>饮料>碳酸饮料',
  saleSpecification: '330ml/罐',
  saleUnit: '罐',
  netContent: '330ml',
  packageForm: '易拉罐',
  storage: '阴凉干燥处保存',
  sellingPoints: ['经典汽水风味', '冰镇饮用口感更佳'],
}

function plan(composeMode: RetailImagePlan['composeMode']): RetailImagePlan {
  return {
    id: composeMode === 'detail' ? '07-detail-page' : composeMode === 'specification' ? '06-specification' : '03-selling-points',
    order: 3,
    label: '内容图',
    objective: '展示真实信息',
    prompt: 'background only',
    negativePrompt: '',
    composeMode,
    copyLines: ['可口可乐经典汽水', '净含量｜330ml', '售卖规格｜330ml/罐'],
    targetSize: composeMode === 'detail' ? { width: 750, height: 2000 } : { width: 600, height: 600 },
    generationSize: '1024x1024',
    generationEligible: true,
    processingMode: 'ai',
  }
}

function specialPlan(type: RetailSpecialImageType, lines: string[], processingMode: RetailImagePlan['processingMode'] = 'deterministic'): RetailImagePlan {
  return {
    id: '08-special',
    order: 8,
    label: '平台特殊图',
    objective: '展示真实商品资料',
    prompt: processingMode === 'source-only' ? '' : 'background only',
    negativePrompt: '',
    composeMode: 'special',
    copyLines: lines,
    targetSize: { width: 600, height: 600 },
    generationSize: '1024x1024',
    generationEligible: true,
    processingMode,
    specialImageType: type,
  }
}

describe('retail deterministic copy composition', () => {
  it('uses exact product facts for specification copy', () => {
    const spec = buildRetailCompositionSpec(plan('specification'), product)
    expect(spec.title).toBe('商品规格')
    expect(spec.lines).toContain('净含量｜330ml')
    expect(spec.lines).toContain('售卖规格｜330ml/罐')
  })

  it('never injects internal QA or pending-information wording into upload copy', () => {
    const spec = buildRetailCompositionSpec(plan('detail'), product)
    const visibleCopy = [spec.title, spec.subtitle, ...spec.lines].join(' ')
    expect(visibleCopy).not.toMatch(/内部|质检|待补充|检查提示|操作说明/)
  })

  it('builds exact copy for product facts, dimensions, and size guides', () => {
    const facts = buildRetailCompositionSpec(specialPlan('product_facts', ['净含量｜330ml', '储存方式｜阴凉处']), product)
    const dimension = buildRetailCompositionSpec(specialPlan('dimension', ['产品尺寸｜160×110×220mm']), product)
    const sizeGuide = buildRetailCompositionSpec(specialPlan('size_guide', ['尺码｜M', '适用体重｜45-55kg']), product)

    expect(facts).toMatchObject({ title: '商品信息', lines: ['净含量｜330ml', '储存方式｜阴凉处'] })
    expect(dimension).toMatchObject({ title: '尺寸参数', lines: ['产品尺寸｜160×110×220mm'] })
    expect(sizeGuide).toMatchObject({ title: '尺码参考', lines: ['尺码｜M', '适用体重｜45-55kg'] })
  })

  it('adds no generated copy to source-only materials', () => {
    const spec = buildRetailCompositionSpec(specialPlan('authentic_document', ['内部审核通过'], 'source-only'), product)

    expect(spec.title).toBe('')
    expect(spec.subtitle).toBe('')
    expect(spec.lines).toEqual([])
  })
})
