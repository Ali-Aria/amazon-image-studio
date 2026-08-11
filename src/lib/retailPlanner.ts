import type {
  RetailArchetype,
  RetailImagePlan,
  RetailProduct,
  RetailSpecialImageEvaluation,
  RetailSlotId,
} from '../types'
import { getConfirmedRetailFacts } from './retailProduct'
import { getRetailGenerationSize, getRetailSlotOutputSize } from './retailPlatform'
import { evaluateRetailSpecialImage } from './retailSpecialImage'

export const RETAIL_BASE_SLOT_IDS: RetailSlotId[] = [
  '01-main',
  '02-front',
  '03-selling-points',
  '04-detail',
  '05-scene',
  '06-specification',
  '07-detail-page',
]

export const RETAIL_SLOT_IDS: RetailSlotId[] = [...RETAIL_BASE_SLOT_IDS, '08-special']

export const RETAIL_STYLE_PRESETS = {
  'clean-retail': {
    label: '平台清爽',
    prompt: 'bright clean instant-retail photography, crisp neutral white, restrained yellow and teal accents, high legibility',
  },
  'qixi-gifting': {
    label: '七夕礼赠',
    prompt: 'Qixi gifting atmosphere, refined coral pink and sky blue accents, heart-shaped paper details and gift ribbon, bright commercial lighting, no flowers',
  },
  'night-delivery': {
    label: '夜间即时',
    prompt: 'fresh night-delivery mood, clean illuminated countertop, subtle cyan and warm red accents, premium convenience retail photography',
  },
  'premium-drinks': {
    label: '质感酒饮',
    prompt: 'premium beverage photography, clear glass reflections, deep neutral background with champagne and berry accents, controlled highlights',
  },
} as const

function cleanLines(values: Array<string | undefined>, max: number) {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)).slice(0, max)
}

function specificationLines(product: RetailProduct) {
  const facts = getConfirmedRetailFacts(product)
  return cleanLines([
    facts['品牌'] && `品牌｜${facts['品牌']}`,
    facts['净含量'] && `净含量｜${facts['净含量']}`,
    facts['售卖规格'] && `售卖规格｜${facts['售卖规格']}`,
    facts['包装形态'] && `包装形态｜${facts['包装形态']}`,
    facts['口味'] && `口味｜${facts['口味']}`,
    facts['酒精度'] && `酒精度｜${facts['酒精度']}`,
    facts['储存方式'] && `储存方式｜${facts['储存方式']}`,
    facts['保质期'] && `保质期｜${facts['保质期']}`,
  ], 8)
}

function slotDefinition(id: RetailSlotId, archetype: RetailArchetype, product: RetailProduct) {
  const index = RETAIL_SLOT_IDS.indexOf(id)
  const categoryObjective = archetype.slot_plan[index]
  const defaults = {
    '01-main': { label: '白底主图', objective: '商品完整居中，快速识别实际售卖内容', composeMode: 'none' },
    '02-front': { label: '商品正面', objective: '清晰展示品牌、包装正面与商品数量', composeMode: 'none' },
    '03-selling-points': { label: '核心卖点', objective: '突出已确认的核心优势，预留稳定文案区', composeMode: 'selling-points' },
    '04-detail': { label: '商品细节', objective: '展示内容物、材质、结构或包装细节', composeMode: 'none' },
    '05-scene': { label: '使用场景', objective: '展示真实消费或使用场景，不添加未售卖商品', composeMode: 'none' },
    '06-specification': { label: '规格信息', objective: '呈现可核验的销售属性与规格', composeMode: 'specification' },
    '07-detail-page': { label: '详情长图', objective: '汇总商品、规格、使用与储存信息', composeMode: 'detail' },
    '08-special': { label: '平台特殊图', objective: '按可信商品资料生成类目适配信息图', composeMode: 'none' },
  } as const
  const base = defaults[id]
  return {
    ...base,
    objective: categoryObjective ? `${base.objective}；类目建议：${categoryObjective}` : base.objective,
  }
}

function copyLinesForSlot(id: RetailSlotId, product: RetailProduct) {
  if (id === '03-selling-points') {
    return cleanLines([product.name, ...product.sellingPoints], 4)
  }
  if (id === '06-specification') return specificationLines(product)
  if (id === '07-detail-page') {
    return cleanLines([
      product.name,
      ...product.sellingPoints.slice(0, 3),
      ...specificationLines(product),
      product.usage && `使用方法｜${product.usage}`,
      product.packageIncludes && `包装清单｜${product.packageIncludes}`,
    ], 12)
  }
  return []
}

export function createRetailImagePlan(
  product: RetailProduct,
  archetype: RetailArchetype,
  platformPresetId: string,
  styleId: string,
  specialEvaluation?: RetailSpecialImageEvaluation,
): RetailImagePlan[] {
  const facts = getConfirmedRetailFacts(product)
  const style = RETAIL_STYLE_PRESETS[styleId as keyof typeof RETAIL_STYLE_PRESETS] ?? RETAIL_STYLE_PRESETS['clean-retail']
  const factBlock = Object.entries(facts)
    .filter(([label]) => !['条码', 'SKU'].includes(label))
    .map(([label, value]) => `${label}: ${value}`)
    .join('; ')

  const basePlans = RETAIL_BASE_SLOT_IDS.map((id, index) => {
    const definition = slotDefinition(id, archetype, product)
    const textFree = definition.composeMode !== 'none'
      ? 'Keep a calm, high-contrast empty copy area. Do not render Chinese or promotional text; exact copy will be composed later.'
      : 'Do not render Chinese or promotional text beyond text already printed on the real product packaging.'
    const mainGuard = id === '01-main'
      ? 'Pure white background. One complete centered product. No props, badges, border, shadow clutter, or extra package.'
      : ''

    return {
      id,
      order: index + 1,
      label: definition.label,
      objective: definition.objective,
      composeMode: definition.composeMode,
      copyLines: copyLinesForSlot(id, product),
      targetSize: getRetailSlotOutputSize(platformPresetId, id),
      generationSize: getRetailGenerationSize(platformPresetId, id),
      generationEligible: true,
      processingMode: 'ai' as const,
      prompt: [
        `Create an upload-ready instant-retail product image for: ${product.name}.`,
        `Image role: ${definition.objective}.`,
        `Confirmed product facts: ${factBlock}.`,
        `Visual direction: ${style.prompt}.`,
        'Use the uploaded source product as the locked subject and preserve the exact product packaging, brand marks, colors, proportions, count, and visible specification. Do not redraw or invent packaging details.',
        mainGuard,
        textFree,
        product.customPrompt.trim(),
      ].filter(Boolean).join('\n'),
      negativePrompt: [
        'altered packaging, misspelled label, invented specification, duplicate product, missing cap, warped logo',
        'price, coupon amount, discount threshold, QR code, watermark, contact information, ratings, sales ranking, other platform logo',
        'internal QA note, placeholder, pending information, instruction text, clutter, low resolution',
        product.forbidden.trim(),
        ...archetype.forbidden,
      ].filter(Boolean).join(', '),
    }
  })

  const special = specialEvaluation ?? evaluateRetailSpecialImage({
    product,
    archetype,
    sourceImageRoles: {},
    preferredType: 'auto',
  })
  const specialId: RetailSlotId = '08-special'
  const specialPrompt = special.processingMode === 'ai-preserve'
    ? [
        `Create an upload-ready instant-retail gift package image for: ${product.name}.`,
        `Confirmed product facts: ${factBlock}.`,
        `Visual direction: ${style.prompt}.`,
        'Use the uploaded product and real gift package images as locked references. Preserve the exact product packaging, brand marks, colors, proportions, count, and outer package. Do not invent another box, ribbon, flavor, quantity, or accessory.',
        'Do not render Chinese or promotional text beyond text already printed on the real packaging.',
        product.customPrompt.trim(),
      ].filter(Boolean).join('\n')
    : ''

  const specialPlan: RetailImagePlan = {
    id: specialId,
    order: 8,
    label: '平台特殊图',
    objective: `${special.label}；${special.reason}`,
    prompt: specialPrompt,
    negativePrompt: special.processingMode === 'ai-preserve'
      ? [
          'invented gift box, altered packaging, fake certificate, fake ingredient list, fake nutrition label, misspelled label, duplicate product',
          'price, coupon amount, discount threshold, QR code, watermark, contact information, ratings, sales ranking, other platform logo',
          product.forbidden.trim(),
          ...archetype.forbidden,
        ].filter(Boolean).join(', ')
      : '',
    composeMode: 'special',
    copyLines: special.copyLines,
    targetSize: getRetailSlotOutputSize(platformPresetId, specialId),
    generationSize: getRetailGenerationSize(platformPresetId, specialId),
    generationEligible: special.state === 'ready',
    processingMode: special.processingMode,
    specialImageType: special.selectedType,
    requiredSourceRole: special.requiredSourceRole,
    blockedReason: special.state === 'ready'
      ? undefined
      : [...special.missingFields, special.reason].filter(Boolean).join('；'),
  }

  return [...basePlans, specialPlan]
}
