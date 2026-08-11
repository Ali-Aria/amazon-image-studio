import { describe, expect, it } from 'vitest'
import type { RetailImagePlan, RetailProduct } from '../types'
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
})
