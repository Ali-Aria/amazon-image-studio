import type {
  RetailArchetype,
  RetailProduct,
  RetailSourceImageRole,
  RetailSpecialImageEvaluation,
  RetailSpecialImageOption,
  RetailSpecialImageState,
  RetailSpecialImageType,
  RetailSpecialProcessingMode,
} from '../types'
import { getTrustedRetailFacts } from './retailProduct'

export const RETAIL_SPECIAL_IMAGE_LABELS: Record<RetailSpecialImageType, string> = {
  product_facts: '商品信息卡',
  dimension: '尺寸参数图',
  size_guide: '尺码参考图',
  gift_pack: '礼盒包装图',
  back_label: '包装背标图',
  authentic_document: '真实材料图',
}

const FACT_CARD_LABELS = [
  '品牌',
  '净含量',
  '售卖规格',
  '售卖单位',
  '包装形态',
  '口味',
  '酒精度',
  '储存方式',
  '保质期',
  '配料',
  '材质',
  '包装清单',
  '使用方法',
  '适用人群',
]

const BASE_FACT_LABELS = new Set(['商品名称', '平台类目', '条码', 'SKU'])
const DIMENSION_PATTERN = /尺寸|长度|宽度|高度|长|宽|高|直径|厚度|重量|功率|电压|容量|型号/
const SIZE_PATTERN = /尺码|身高|体重|年龄|鞋码|腰围|胸围|衣长|肩宽|臀围/
const GIFT_PATTERN = /礼盒|礼品|礼物|伴手礼|巧克力|七夕|情人节/

function hasRole(roles: Record<string, RetailSourceImageRole>, role: RetailSourceImageRole) {
  return Object.values(roles).includes(role)
}

function visibleLines(facts: Record<string, string>, labels: string[], max = 8) {
  const lines = labels.flatMap((label) => facts[label] ? [`${label}｜${facts[label]}`] : [])
  return [...new Set(lines)].slice(0, max)
}

function matchedLines(facts: Record<string, string>, pattern: RegExp, max = 8) {
  return Object.entries(facts)
    .filter(([label]) => !BASE_FACT_LABELS.has(label) && pattern.test(label))
    .map(([label, value]) => `${label}｜${value}`)
    .slice(0, max)
}

function option(input: {
  type: RetailSpecialImageType
  state: RetailSpecialImageState
  missingFields?: string[]
  copyLines?: string[]
  requiredSourceRole?: RetailSourceImageRole
  processingMode: RetailSpecialProcessingMode
  reason: string
}): RetailSpecialImageOption {
  return {
    type: input.type,
    label: RETAIL_SPECIAL_IMAGE_LABELS[input.type],
    state: input.state,
    eligible: input.state === 'ready',
    missingFields: input.missingFields ?? [],
    copyLines: input.copyLines ?? [],
    requiredSourceRole: input.requiredSourceRole,
    processingMode: input.processingMode,
    allowAiGeneration: input.processingMode === 'ai-preserve',
    reason: input.reason,
  }
}

function fieldOrUploadState(missingFields: string[], missingUpload: boolean): RetailSpecialImageState {
  if (missingFields.length > 0) return 'needs-fields'
  return missingUpload ? 'needs-upload' : 'ready'
}

function automaticPriority(product: RetailProduct, archetype: RetailArchetype): RetailSpecialImageType[] {
  const result: RetailSpecialImageType[] = []
  if (GIFT_PATTERN.test(`${product.name} ${product.categoryPath}`)) result.push('gift_pack')
  if (['apparel_textile', 'mother_baby'].includes(archetype.id)) result.push('size_guide')
  if (['electronics', 'home_kitchen', 'home_improvement', 'automotive_outdoor'].includes(archetype.id)) result.push('dimension')
  result.push('product_facts', 'back_label', 'authentic_document', 'dimension', 'size_guide', 'gift_pack')
  return [...new Set(result)]
}

export function evaluateRetailSpecialImage(input: {
  product: RetailProduct
  archetype: RetailArchetype
  sourceImageRoles: Record<string, RetailSourceImageRole>
  preferredType: RetailSpecialImageType | 'auto'
}): RetailSpecialImageEvaluation {
  const facts = getTrustedRetailFacts(input.product)
  const hasProductImage = hasRole(input.sourceImageRoles, 'product')
  const factDetails = Object.keys(facts).filter((label) => !['商品名称', '品牌', '平台类目', '条码', 'SKU', '售卖规格', '售卖单位'].includes(label))
  const factMissing = [
    !facts['商品名称'] && '商品名称',
    !facts['品牌'] && '品牌',
    !facts['售卖规格'] && '售卖规格',
    factDetails.length < 2 && '至少 2 项商品参数',
  ].filter((value): value is string => Boolean(value))
  const factState = fieldOrUploadState(factMissing, !hasProductImage)
  const dimensionLines = matchedLines(facts, DIMENSION_PATTERN)
  const sizeLines = matchedLines(facts, SIZE_PATTERN)
  const dimensionMissing = dimensionLines.length > 0 ? [] : ['尺寸或关键参数']
  const sizeMissing = sizeLines.length > 0 ? [] : ['尺码映射']
  const hasGiftImage = hasRole(input.sourceImageRoles, 'gift_pack')
  const hasBackLabel = hasRole(input.sourceImageRoles, 'back_label')
  const hasAuthenticDocument = hasRole(input.sourceImageRoles, 'authentic_document')

  const options: RetailSpecialImageOption[] = [
    option({
      type: 'product_facts',
      state: factState,
      missingFields: [...factMissing, ...(!hasProductImage ? ['商品主体图'] : [])],
      copyLines: visibleLines(facts, [
        ...FACT_CARD_LABELS,
        ...Object.keys(facts).filter((label) => !FACT_CARD_LABELS.includes(label) && !BASE_FACT_LABELS.has(label)),
      ]),
      requiredSourceRole: 'product',
      processingMode: 'deterministic',
      reason: factState === 'ready' ? '可信商品字段已满足信息卡要求' : '需要补齐商品字段或主体图',
    }),
    option({
      type: 'dimension',
      state: fieldOrUploadState(dimensionMissing, !hasProductImage),
      missingFields: [...dimensionMissing, ...(!hasProductImage ? ['商品主体图'] : [])],
      copyLines: dimensionLines,
      requiredSourceRole: 'product',
      processingMode: 'deterministic',
      reason: dimensionLines.length > 0 ? '已找到可信尺寸或参数字段' : '缺少可核验的尺寸或关键参数',
    }),
    option({
      type: 'size_guide',
      state: fieldOrUploadState(sizeMissing, !hasProductImage),
      missingFields: [...sizeMissing, ...(!hasProductImage ? ['商品主体图'] : [])],
      copyLines: sizeLines,
      requiredSourceRole: 'product',
      processingMode: 'deterministic',
      reason: sizeLines.length > 0 ? '已找到可信尺码映射' : '缺少可核验的尺码映射',
    }),
    option({
      type: 'gift_pack',
      state: hasProductImage && hasGiftImage ? 'ready' : 'needs-upload',
      missingFields: [!hasProductImage && '商品主体图', !hasGiftImage && '真实礼盒/外包装图'].filter((value): value is string => Boolean(value)),
      requiredSourceRole: 'gift_pack',
      processingMode: 'ai-preserve',
      reason: hasProductImage && hasGiftImage ? '商品与真实礼盒参考图已齐全' : '礼盒展示必须使用真实外包装参考图',
    }),
    option({
      type: 'back_label',
      state: hasBackLabel ? 'ready' : 'needs-upload',
      missingFields: hasBackLabel ? [] : ['真实包装背标图'],
      requiredSourceRole: 'back_label',
      processingMode: 'source-only',
      reason: hasBackLabel ? '将只对真实背标图做清晰化和规格适配' : '包装背标不得由 AI 重绘',
    }),
    option({
      type: 'authentic_document',
      state: hasAuthenticDocument ? 'ready' : 'needs-upload',
      missingFields: hasAuthenticDocument ? [] : ['真实证照/检测/备案材料'],
      requiredSourceRole: 'authentic_document',
      processingMode: 'source-only',
      reason: hasAuthenticDocument ? '将只整理真实材料原件' : '证照与检测材料只允许上传真实原件',
    }),
  ]

  const readyByType = new Map(options.filter((candidate) => candidate.eligible).map((candidate) => [candidate.type, candidate]))
  const manual = input.preferredType === 'auto' ? null : readyByType.get(input.preferredType)
  const selected = manual ?? automaticPriority(input.product, input.archetype)
    .map((type) => readyByType.get(type))
    .find(Boolean)
    ?? options.find((candidate) => candidate.type === (input.preferredType === 'auto' ? automaticPriority(input.product, input.archetype)[0] : input.preferredType))
    ?? options[0]

  return {
    ...selected,
    selectedType: selected.type,
    eligibleTypes: options.filter((candidate) => candidate.eligible).map((candidate) => candidate.type),
    options,
  }
}
