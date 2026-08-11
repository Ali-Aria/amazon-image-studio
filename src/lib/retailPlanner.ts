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
import { computeSlotSafeBox } from './retailSafeBox'
import {
  containsCjk,
  renderRetailSlotPrompt,
  RETAIL_SHARED_NEGATIVES,
  RETAIL_SLOT_RECIPES,
} from './retailSlotRecipes'
import { buildRetailUnitClause, parseRetailUnitCount } from './retailUnitCount'

/** 只有这些事实是视觉上可核对的；中文描述性字段不进 prompt，参考图才是权威 */
const ASCII_FACT_LABELS: Record<string, string> = {
  净含量: 'net content',
  售卖规格: 'pack spec',
  酒精度: 'alcohol by volume',
  重量: 'weight',
  尺寸: 'size',
}

/**
 * prompt 必须是纯 ASCII 英文。中文商品名与中文属性值一律不进 prompt：
 * 一来英文指令里夹中文会明显拉低服从度，二来把中文事实喂进去等于邀请模型
 * 把这些字「画」到包装上，而包装文字只能从参考图像素级复制。
 */
function buildAsciiFacts(facts: Record<string, string>) {
  const entries = Object.entries(ASCII_FACT_LABELS)
    .flatMap(([zhLabel, enLabel]) => {
      const value = facts[zhLabel]?.trim()
      if (!value || containsCjk(value)) return []
      return [`${enLabel} ${value}`]
    })
  return entries.length > 0 ? entries.join(', ') : 'none machine-checkable; the reference image is the only authority'
}

/** 用类目英文标识描述主体，而不是把中文商品名塞进 prompt */
function toAsciiSubject(archetype: RetailArchetype, unitNoun: string) {
  const category = archetype.id.replace(/_/g, ' ')
  return unitNoun === 'unit' ? `a ${category} product` : `a ${category} product in a ${unitNoun}`
}

function buildLockedList(facts: Record<string, string>) {
  const parts = [
    'the package shape and proportions',
    'every printed glyph and graphic exactly as photographed',
    'the brand marks',
    'the colours and finish',
    'the unit count',
  ]
  if (facts['净含量'] && !containsCjk(facts['净含量'])) parts.push('the printed net content marking')
  return parts.join(', ')
}

/** AVOID 行的上限。超过这个长度模型的注意力会被稀释，但**被砍掉的必须是最不要紧的那部分** */
const MAX_SLOT_NEGATIVES = 34

/**
 * 拼接顺序即优先级：合规红线 → 类目禁令 → 件数 → 用户禁用元素 → 逐位负面。
 * 顺序反了会出静默事故：把合规词排在尾部再截断，等于每条 prompt 都悄悄丢掉
 * 「其他平台标识」这类红线词，以及知识库刚写好的全部类目禁令和用户自己填的禁用元素。
 */
function buildSlotNegatives(
  slotNegatives: string[],
  unitNegatives: string[],
  product: RetailProduct,
  archetype: RetailArchetype,
) {
  const custom = product.forbidden.trim()
  const merged = [
    ...RETAIL_SHARED_NEGATIVES,
    // 知识库的中文 forbidden 只给人看；只有英文镜像才允许进模型
    ...(archetype.forbidden_en ?? []),
    ...unitNegatives,
    ...(custom && !containsCjk(custom) ? [custom] : []),
    ...slotNegatives,
  ]
  return [...new Set(merged.map((value) => value.trim().toLowerCase()).filter(Boolean))].slice(0, MAX_SLOT_NEGATIVES)
}

/** 用户补充要求里出现这些词，等于把违禁元素当正向指令喂给模型 */
const OVERRIDE_BANNED = /price|coupon|discount|qr\s*code|watermark|phone|contact|ribbon|bow|gift box|sticker|badge|logo|certificat|award|medal/i

export interface RetailOverrideCheck {
  value: string
  rejectedReason: 'cjk' | 'banned' | null
}

/**
 * 用户的「补充生成要求」原样拼进 prompt 是个口子：写中文会打破纯 ASCII 不变量，
 * 写「加条丝带」「加个价签」则会以正向指令的身份压过白底与合规守卫。
 * 这里 fail-closed——宁可整条不用，也不把它送进模型。
 */
export function checkRetailPromptOverride(value: string): RetailOverrideCheck {
  const trimmed = value.trim()
  if (!trimmed) return { value: '', rejectedReason: null }
  if (containsCjk(trimmed)) return { value: '', rejectedReason: 'cjk' }
  if (OVERRIDE_BANNED.test(trimmed)) return { value: '', rejectedReason: 'banned' }
  return { value: trimmed, rejectedReason: null }
}

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

/**
 * 风格拆成两个通道：lighting 只描述光与色调，set 才描述道具与环境。
 * 白底主图、正面图、规格图只吃 lighting——原来把整条风格词无条件注入七位，
 * 「七夕礼赠」的礼品丝带会和白底主图「无道具」的硬约束在同一条 prompt 里直接打架。
 */
export const RETAIL_STYLE_PRESETS = {
  'clean-retail': {
    label: '平台清爽',
    lighting: 'Bright neutral commercial lighting, crisp daylight white balance, high legibility.',
    set: 'Clean modern retail surroundings with restrained props.',
  },
  'qixi-gifting': {
    label: '七夕礼赠',
    lighting: 'Bright commercial lighting with a soft warm coral cast.',
    set: 'Refined Qixi gifting surroundings in coral pink and sky blue, no flowers.',
  },
  'night-delivery': {
    label: '夜间即时',
    lighting: 'Cool evening key light with warm practical fill, controlled contrast.',
    set: 'A clean illuminated night-time countertop in a convenience retail setting.',
  },
  'premium-drinks': {
    label: '质感酒饮',
    lighting: 'Controlled directional highlights, deep neutral tonality, glassware-grade specular control.',
    set: 'A premium bar or tasting surface with restrained champagne and berry accents.',
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

/**
 * 类目方向：只认按 slotId 键控的 slot_directions，且只取英文那份进 prompt。
 * 旧的 slot_plan 是一个 7 元素裸数组、按 RETAIL_SLOT_IDS 下标直取，但知识库那份
 * 序列里没有「核心卖点」这一位，23/23 个原型整体错位一格——卖点位被要求拍内容物细节、
 * 细节位被要求拍饮用场景。错的方向比没有方向更糟，所以在知识库补齐键控结构之前，
 * 这里宁可返回空串，也不再按下标取值。
 */
function categoryDirectionFor(id: RetailSlotId, archetype: RetailArchetype): { en: string; zh: string } {
  const directions = archetype.slot_directions?.[id]
  return { en: directions?.en?.trim() ?? '', zh: directions?.zh?.trim() ?? '' }
}

function slotDefinition(id: RetailSlotId, archetype: RetailArchetype, product: RetailProduct) {
  const categoryObjective = categoryDirectionFor(id, archetype).zh
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
  const factBlock = buildAsciiFacts(facts)

  const unitCount = parseRetailUnitCount(product.saleSpecification, product.saleUnit)
  const unit = buildRetailUnitClause(unitCount)
  const lockedList = buildLockedList(facts)
  const override = checkRetailPromptOverride(product.customPrompt)

  const basePlans = RETAIL_BASE_SLOT_IDS.map((id, index) => {
    const definition = slotDefinition(id, archetype, product)
    const recipe = RETAIL_SLOT_RECIPES[id]
    const generationSize = getRetailGenerationSize(platformPresetId, id)
    const safeBox = computeSlotSafeBox(platformPresetId, id, generationSize)
    const subjectRules = archetype.subject_rules

    return {
      id,
      order: index + 1,
      label: definition.label,
      objective: definition.objective,
      composeMode: definition.composeMode,
      copyLines: copyLinesForSlot(id, product),
      targetSize: getRetailSlotOutputSize(platformPresetId, id),
      generationSize,
      generationEligible: true,
      processingMode: 'ai' as const,
      prompt: renderRetailSlotPrompt(recipe, {
        name: toAsciiSubject(archetype, unitCount.count === null ? 'unit' : unitCount.unitNoun),
        facts: factBlock,
        safeBox,
        lockedList,
        styleLighting: style.lighting,
        styleSet: style.set,
        categoryDirection: categoryDirectionFor(id, archetype).en,
        unitClause: unit.clause,
        unitRestate: unit.restate,
        rotationCap: subjectRules?.rotation_cap_en ?? '10 degrees',
        detailTarget: subjectRules?.detail_targets?.join(' or ') ?? 'a surface that is clearly visible in the reference',
        cameraAngle: subjectRules?.camera_angle_en ?? 'eye level',
        sceneSurface: subjectRules?.scene_surfaces?.join(' or ') ?? 'a plain everyday surface',
        specFace: subjectRules?.text_surfaces?.join(' or ') ?? 'the face that carries the printed specification',
        slotOverride: override.value,
        negatives: buildSlotNegatives(recipe.slotNegatives, unit.negatives, product, archetype),
      }),
      // 逐位负面词已经作为 AVOID 行渲染进 prompt 本体；这里保留字段只为兼容旧数据，
      // 绝不能再被下游拼回正向 prompt——把「价格/优惠券/二维码」当正向文本喂给生图模型
      // 恰恰是让它把这些元素画出来的典型诱因。
      negativePrompt: '',
    }
  })

  const special = specialEvaluation ?? evaluateRetailSpecialImage({
    product,
    archetype,
    sourceImageRoles: {},
    preferredType: 'auto',
  })
  const specialId: RetailSlotId = '08-special'
  const specialGenerationSize = getRetailGenerationSize(platformPresetId, specialId)
  const specialRecipe = RETAIL_SLOT_RECIPES['08-special']
  // 只有礼盒图会进模型；背标与证照走 source-only，信息卡与尺码表走 Canvas 确定性排版。
  // 这一位同样只吃 lighting 通道：礼赠风格词里的「丝带」会和「不得凭空造礼盒丝带」直接打架。
  const specialPrompt = special.processingMode === 'ai-preserve'
    ? renderRetailSlotPrompt(specialRecipe, {
        name: toAsciiSubject(archetype, unitCount.count === null ? 'unit' : unitCount.unitNoun),
        facts: factBlock,
        safeBox: computeSlotSafeBox(platformPresetId, specialId, specialGenerationSize),
        lockedList: `${lockedList}, and the exact shape, opening structure, printing, colour and closure of the outer package from [image 2]`,
        styleLighting: style.lighting,
        styleSet: '',
        categoryDirection: categoryDirectionFor(specialId, archetype).en,
        unitClause: `${unit.clause} [image 2] IS the real outer package and is the only authority for its geometry, print and finish.`,
        unitRestate: unit.restate,
        rotationCap: archetype.subject_rules?.rotation_cap_en ?? '20 degrees',
        detailTarget: '',
        cameraAngle: 'slightly raised',
        sceneSurface: '',
        specFace: '',
        slotOverride: override.value,
        negatives: buildSlotNegatives(specialRecipe.slotNegatives, unit.negatives, product, archetype),
      })
    : ''

  const specialPlan: RetailImagePlan = {
    id: specialId,
    order: 8,
    label: '平台特殊图',
    objective: `${special.label}；${special.reason}`,
    prompt: specialPrompt,
    negativePrompt: '',
    composeMode: 'special',
    copyLines: special.copyLines,
    targetSize: getRetailSlotOutputSize(platformPresetId, specialId),
    generationSize: specialGenerationSize,
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
