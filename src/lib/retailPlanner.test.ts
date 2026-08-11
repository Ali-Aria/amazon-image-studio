import { describe, expect, it } from 'vitest'
import type { RetailArchetype, RetailProduct } from '../types'
import { checkRetailPromptOverride, createRetailImagePlan, RETAIL_BASE_SLOT_IDS, RETAIL_SLOT_IDS } from './retailPlanner'
import { containsCjk } from './retailSlotRecipes'
import { createEmptyRetailProduct } from './retailProduct'
import { evaluateRetailSpecialImage } from './retailSpecialImage'

const archetype: RetailArchetype = {
  id: 'alcohol',
  label: '酒水',
  match_keywords: ['酒'],
  required_facts: ['商品名称', '品牌', '酒精度', '净含量', '包装形态', '售卖规格', '储存方式'],
  // 故意保留知识库里那份错位的 slot_plan：它按 RETAIL_SLOT_IDS 下标取值会把
  // 「酒体或杯饮细节」喂给卖点位、「真实饮用场景」喂给细节位，本文件下方有断言证明
  // 新实现已经不再消费它。
  slot_plan: ['白底主图', '瓶身与包装正面', '酒体或杯饮细节', '真实饮用场景', '礼赠或组合展示', '酒精度与规格信息', '商品详情长图'],
  forbidden: ['不得编造商品事实'],
  forbidden_en: ['invented product fact'],
  subject_rules: {
    detail_targets: ['the cap and seal', 'the embossed shoulder'],
    text_surfaces: ['the front label'],
    scene_surfaces: ['a chilled bar counter'],
    camera_angle_en: 'eye level',
    rotation_cap_en: '10 degrees',
  },
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
  const evaluateSpecial = (preferredType: Parameters<typeof evaluateRetailSpecialImage>[0]['preferredType'] = 'auto') => evaluateRetailSpecialImage({
    product,
    archetype,
    sourceImageRoles: { 'image-product': 'product' },
    preferredType,
  })

  it('keeps seven base slots and appends one optional special slot', () => {
    const plan = createRetailImagePlan(product, archetype, 'meituan-square', 'qixi-gifting', evaluateSpecial())

    expect(plan.map((item) => item.id)).toEqual(RETAIL_SLOT_IDS)
    expect(RETAIL_BASE_SLOT_IDS).toHaveLength(7)
    expect(plan).toHaveLength(8)
    expect(plan[0]).toMatchObject({ label: '白底主图', composeMode: 'none' })
    expect(plan[5]).toMatchObject({ label: '规格信息', composeMode: 'specification' })
    expect(plan[6]).toMatchObject({ label: '详情长图', composeMode: 'detail' })
    expect(plan[7]).toMatchObject({
      id: '08-special',
      label: '平台特殊图',
      specialImageType: 'product_facts',
      generationEligible: true,
      processingMode: 'deterministic',
      composeMode: 'special',
    })
  })

  it('锁定主体且把中文完全留给 Canvas，prompt 保持纯 ASCII', () => {
    const plan = createRetailImagePlan(product, archetype, 'meituan-square', 'qixi-gifting', evaluateSpecial())
    const prompts = plan.map((item) => item.prompt).join('\n')

    // 中文商品名与中文属性值都不进 prompt：夹中文会拉低服从度，
    // 更会诱导模型把这些字画到包装上，而包装文字只能从参考图像素级复制
    expect(containsCjk(prompts)).toBe(false)
    expect(prompts).toContain('Printed material is PIXELS, not characters')
    expect(prompts).toContain('KEEP EXACTLY from [image 1]')
    expect(prompts).not.toMatch(/满\s*\d+\s*减\s*\d+/)
    expect(prompts).not.toMatch(/[¥￥]\s*\d/)
  })

  it('七个基础位各自拿到不同的可执行视觉指令', () => {
    const plan = createRetailImagePlan(product, archetype, 'meituan-square', 'clean-retail', evaluateSpecial())
    const basePrompts = plan.filter((item) => item.id !== '08-special').map((item) => item.prompt)

    expect(new Set(basePrompts).size).toBe(7)
    // 景别/机位/构图词必须真实存在，而不是只靠一句目标句区分
    for (const prompt of basePrompts) {
      expect(prompt).toMatch(/FRAMING: .+/)
      expect(prompt).toMatch(/LAYOUT: the product bounding box fits inside x \d+%-\d+% and y \d+%-\d+%/)
      expect(prompt).toMatch(/RESTATE: /)
    }
    expect(plan.find((item) => item.id === '04-detail')!.prompt).toContain('macro')
    expect(plan.find((item) => item.id === '05-scene')!.prompt).toContain('environmental mid shot')
  })

  it('只有需要留白的两位下达静区指令，详情长图不下', () => {
    const plan = createRetailImagePlan(product, archetype, 'meituan-square', 'clean-retail', evaluateSpecial())
    const reserved = (id: string) => plan.find((item) => item.id === id)!.prompt.includes('RESERVED:')

    expect(reserved('03-selling-points')).toBe(true)
    expect(reserved('06-specification')).toBe(true)
    // 07 的文案画在图带下方，图带本身不被遮挡，下留白指令只会白白缩小商品
    expect(reserved('07-detail-page')).toBe(false)
    expect(reserved('01-main')).toBe(false)
  })

  it('合规红线与类目禁令永远排在 AVOID 行前面，被截断的只能是逐位补充词', () => {
    const plan = createRetailImagePlan(product, archetype, 'meituan-square', 'clean-retail', evaluateSpecial())

    for (const item of plan.filter((entry) => entry.prompt)) {
      const avoid = item.prompt.split('AVOID: ')[1].split('\n')[0]
      // 旧实现把 shared 排在逐位负面之后再 slice，导致每条 prompt 都悄悄丢掉
      // 「其他平台标识」这类红线词，以及知识库刚写好的全部类目禁令
      expect(avoid, item.id).toContain('other platform logo')
      expect(avoid, item.id).toContain('watermark')
      expect(avoid, item.id).toContain('invented product fact')
    }
  })

  it('用户补充要求含中文或违禁词时整条不进 prompt', () => {
    expect(checkRetailPromptOverride('加一条丝带')).toMatchObject({ value: '', rejectedReason: 'cjk' })
    expect(checkRetailPromptOverride('add a red gift ribbon')).toMatchObject({ value: '', rejectedReason: 'banned' })
    expect(checkRetailPromptOverride('keep the cap facing left')).toMatchObject({ value: 'keep the cap facing left', rejectedReason: null })

    const risky = { ...product, customPrompt: '加一条丝带，背景改成深色木纹' }
    const plan = createRetailImagePlan(risky, archetype, 'meituan-square', 'clean-retail', evaluateSpecial())
    for (const item of plan.filter((entry) => entry.prompt)) {
      expect(containsCjk(item.prompt), item.id).toBe(false)
      expect(item.prompt, item.id).not.toContain('NOTE:')
    }
  })

  it('审核三张不吃带色偏的风格打光', () => {
    const plan = createRetailImagePlan(product, archetype, 'meituan-square', 'night-delivery', evaluateSpecial())
    const light = (id: string) => plan.find((item) => item.id === id)!.prompt.split('LIGHT: ')[1].split('\n')[0]

    // 「夜间即时」的冷调打光会和同一条 prompt 里的 pure white / no colour cast 打架
    expect(light('01-main')).not.toContain('Cool evening key light')
    expect(light('02-front')).not.toContain('Cool evening key light')
    expect(light('06-specification')).not.toContain('Cool evening key light')
    expect(light('05-scene')).toContain('Cool evening key light')
  })

  it('白底主图不会被礼赠风格污染成有道具的画面', () => {
    const plan = createRetailImagePlan(product, archetype, 'meituan-square', 'qixi-gifting', evaluateSpecial())
    const main = plan.find((item) => item.id === '01-main')!.prompt
    const scene = plan.find((item) => item.id === '05-scene')!.prompt

    expect(main).toContain('pure white RGB 255,255,255')
    expect(main).not.toContain('Qixi gifting')
    // 场景位才吃道具通道
    expect(scene).toContain('Qixi gifting surroundings')
  })

  it('负面词不再被回灌进正向 prompt', () => {
    const plan = createRetailImagePlan(product, archetype, 'meituan-square', 'clean-retail', evaluateSpecial())

    for (const item of plan) {
      expect(item.negativePrompt).toBe('')
      if (!item.prompt) continue
      // 违禁名词只允许出现在末尾的 AVOID 行，正向块里一次都不许出现
      const beforeAvoid = item.prompt.split('AVOID:')[0]
      expect(beforeAvoid).not.toMatch(/coupon|qr code|watermark|price tag/i)
    }
  })

  it('不再按下标消费错位的 slot_plan', () => {
    const plan = createRetailImagePlan(product, archetype, 'meituan-square', 'clean-retail', evaluateSpecial())
    const sellingPoints = plan.find((item) => item.id === '03-selling-points')!
    const detail = plan.find((item) => item.id === '04-detail')!

    // 旧实现会把 slot_plan[2]='酒体或杯饮细节' 喂给卖点位、slot_plan[3]='真实饮用场景' 喂给细节位
    expect(sellingPoints.objective).not.toContain('酒体或杯饮细节')
    expect(detail.objective).not.toContain('真实饮用场景')
    expect(detail.prompt).not.toContain('drinking scene')
  })

  it('类目方向按 slotId 键控注入，且只取英文那份', () => {
    const keyed: RetailArchetype = {
      ...archetype,
      slot_directions: {
        '04-detail': { zh: '酒体或杯饮细节', en: 'crop in on the cap seal and the embossed shoulder' },
      },
    }
    const plan = createRetailImagePlan(product, keyed, 'meituan-square', 'clean-retail', evaluateSpecial())
    const detail = plan.find((item) => item.id === '04-detail')!

    expect(detail.prompt).toContain('DIRECTION: crop in on the cap seal and the embossed shoulder')
    expect(containsCjk(detail.prompt)).toBe(false)
    expect(detail.objective).toContain('酒体或杯饮细节')
  })

  it('uses only confirmed product facts in specification copy', () => {
    const plan = createRetailImagePlan(product, archetype, 'meituan-square', 'clean-retail', evaluateSpecial())
    const spec = plan.find((item) => item.id === '06-specification')!

    expect(spec.copyLines).toEqual(expect.arrayContaining(['净含量｜330ml', '酒精度｜3%vol', '售卖规格｜330ml/罐']))
    expect(spec.copyLines.join(' ')).not.toContain('适合所有人群')
  })

  it('never creates a model prompt for authentic documents', () => {
    const evaluation = evaluateRetailSpecialImage({
      product,
      archetype,
      sourceImageRoles: { 'image-product': 'product', 'image-document': 'authentic_document' },
      preferredType: 'authentic_document',
    })
    const special = createRetailImagePlan(product, archetype, 'meituan-square', 'clean-retail', evaluation).at(-1)!

    expect(special).toMatchObject({
      id: '08-special',
      specialImageType: 'authentic_document',
      generationEligible: true,
      processingMode: 'source-only',
      prompt: '',
      copyLines: [],
    })
  })
})
