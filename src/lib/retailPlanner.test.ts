import { describe, expect, it } from 'vitest'
import type { RetailArchetype, RetailProduct } from '../types'
import { createRetailImagePlan, RETAIL_SLOT_IDS } from './retailPlanner'
import { createEmptyRetailProduct } from './retailProduct'

const archetype: RetailArchetype = {
  id: 'alcohol',
  label: '酒水',
  match_keywords: ['酒'],
  required_facts: ['商品名称', '品牌', '酒精度', '净含量', '包装形态', '售卖规格', '储存方式'],
  slot_plan: ['白底主图', '瓶身与包装正面', '酒体或杯饮细节', '真实饮用场景', '礼赠或组合展示', '酒精度与规格信息', '商品详情长图'],
  forbidden: ['不得编造商品事实'],
}

const product: RetailProduct = {
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
  sellingPoints: ['白桃风味', '低酒精度微醺口感'],
}

describe('seven-image retail plan', () => {
  it('always returns the upload-oriented seven slots in a stable order', () => {
    const plan = createRetailImagePlan(product, archetype, 'meituan-square', 'qixi-gifting')

    expect(plan.map((item) => item.id)).toEqual(RETAIL_SLOT_IDS)
    expect(plan).toHaveLength(7)
    expect(plan[0]).toMatchObject({ label: '白底主图', composeMode: 'none' })
    expect(plan[5]).toMatchObject({ label: '规格信息', composeMode: 'specification' })
    expect(plan[6]).toMatchObject({ label: '详情长图', composeMode: 'detail' })
  })

  it('locks product identity and leaves exact Chinese copy to deterministic composition', () => {
    const plan = createRetailImagePlan(product, archetype, 'meituan-square', 'qixi-gifting')
    const prompts = plan.map((item) => item.prompt).join('\n')

    expect(prompts).toContain('RIO 微醺白桃味鸡尾酒')
    expect(prompts).toContain('preserve the exact product packaging')
    expect(prompts).toContain('Do not render Chinese or promotional text')
    expect(prompts).not.toMatch(/满\s*\d+\s*减\s*\d+/)
    expect(prompts).not.toMatch(/[¥￥]\s*\d/)
  })

  it('uses only confirmed product facts in specification copy', () => {
    const plan = createRetailImagePlan(product, archetype, 'meituan-square', 'clean-retail')
    const spec = plan.find((item) => item.id === '06-specification')!

    expect(spec.copyLines).toEqual(expect.arrayContaining(['净含量｜330ml', '酒精度｜3%vol', '售卖规格｜330ml/罐']))
    expect(spec.copyLines.join(' ')).not.toContain('适合所有人群')
  })
})
