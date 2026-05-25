import type { AmazonImageKind, AmazonPromptDraft } from './amazonPrompt'
import { calculateImageSize, type SizeTier } from './size'

export type AmazonPlannerMode = 'listing' | 'aplus'
export type APlusContentType = 'standard' | 'standard-large' | 'premium'
export type APlusModuleKind =
  | 'header-banner'
  | 'single-image'
  | 'highlight-tile'
  | 'hero-banner'
  | 'feature-image'
  | 'brand-story'
  | 'logo'
  | 'comparison-thumbnail'

export interface ListingParseResult {
  title: string
  bullets: string[]
  inferred: Partial<AmazonPromptDraft>
}

export interface AmazonImagePlan {
  slot: string
  label: string
  kind: AmazonImageKind
  objective: string
  concept: string
  copy: string
  compliance: string
  scene: string
  prompt: string
}

export interface AmazonAPlusModuleSpec {
  contentType: APlusContentType | 'optional'
  slot: string
  label: string
  displayLabel: string
  moduleType: APlusModuleKind
  uploadWidth: number
  uploadHeight: number
  objective: string
}

export interface AmazonAPlusPlan {
  slot: string
  label: string
  moduleType: APlusModuleKind
  uploadSize: string
  generationSize: string
  objective: string
  concept: string
  copy: string
  textTitle: string
  textBody: string
  compliance: string
  scene: string
  prompt: string
}

export const STANDARD_A_PLUS_MODULE_SPECS: AmazonAPlusModuleSpec[] = [
  {
    contentType: 'standard',
    slot: 'A+S01',
    label: 'Header Banner',
    displayLabel: '顶部横幅',
    moduleType: 'header-banner',
    uploadWidth: 970,
    uploadHeight: 300,
    objective: '用横幅建立品牌质感和核心产品利益点。',
  },
  ...Array.from({ length: 3 }, (_, index) => ({
    contentType: 'standard' as const,
    slot: `A+S0${index + 2}`,
    label: `Single Image ${index + 1}`,
    displayLabel: `大图模块 ${index + 1}`,
    moduleType: 'single-image' as const,
    uploadWidth: 970,
    uploadHeight: 600,
    objective: '用单图模块讲清一个关键卖点或使用场景。',
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    contentType: 'standard' as const,
    slot: `A+S0${index + 5}`,
    label: `Highlight Tile ${index + 1}`,
    displayLabel: `卖点方块 ${index + 1}`,
    moduleType: 'highlight-tile' as const,
    uploadWidth: 220,
    uploadHeight: 220,
    objective: '用方形图块快速呈现一个产品亮点。',
  })),
]

export const STANDARD_LARGE_A_PLUS_MODULE_SPECS: AmazonAPlusModuleSpec[] = [
  {
    contentType: 'standard-large',
    slot: 'A+L01',
    label: 'Header Banner',
    displayLabel: '顶部横幅',
    moduleType: 'header-banner',
    uploadWidth: 970,
    uploadHeight: 300,
    objective: '用横幅建立品牌质感和核心产品利益点。',
  },
  ...Array.from({ length: 4 }, (_, index) => ({
    contentType: 'standard-large' as const,
    slot: `A+L0${index + 2}`,
    label: `Single Image ${index + 1}`,
    displayLabel: `大图模块 ${index + 1}`,
    moduleType: 'single-image' as const,
    uploadWidth: 970,
    uploadHeight: 600,
    objective: '用整张大图讲清一个关键卖点、使用场景或细节证据。',
  })),
]

export const PREMIUM_A_PLUS_MODULE_SPECS: AmazonAPlusModuleSpec[] = [
  {
    contentType: 'premium',
    slot: 'A+P01',
    label: 'Hero Banner',
    displayLabel: '高级首屏横幅',
    moduleType: 'hero-banner',
    uploadWidth: 1464,
    uploadHeight: 600,
    objective: '用高级横幅建立首屏视觉冲击和品牌氛围。',
  },
  ...Array.from({ length: 3 }, (_, index) => ({
    contentType: 'premium' as const,
    slot: `A+P0${index + 2}`,
    label: `Feature Image ${index + 1}`,
    displayLabel: `高级大图模块 ${index + 1}`,
    moduleType: 'feature-image' as const,
    uploadWidth: 970,
    uploadHeight: 600,
    objective: '用大图模块展示核心功能、材质或真实场景。',
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    contentType: 'premium' as const,
    slot: `A+P0${index + 5}`,
    label: `Brand Story ${index + 1}`,
    displayLabel: `品牌故事 ${index + 1}`,
    moduleType: 'brand-story' as const,
    uploadWidth: 463,
    uploadHeight: 625,
    objective: '用竖版品牌故事模块强化信任和使用想象。',
  })),
]

export const OPTIONAL_A_PLUS_MODULE_SPECS: AmazonAPlusModuleSpec[] = [
  {
    contentType: 'optional',
    slot: 'A+LOGO',
    label: 'Logo Image',
    displayLabel: '品牌 Logo',
    moduleType: 'logo',
    uploadWidth: 600,
    uploadHeight: 180,
    objective: '用于已有品牌标志素材，不默认生成虚构 Logo。',
  },
  {
    contentType: 'optional',
    slot: 'A+CMP',
    label: 'Comparison Thumbnail',
    displayLabel: '对比缩略图',
    moduleType: 'comparison-thumbnail',
    uploadWidth: 150,
    uploadHeight: 300,
    objective: '用于同品牌 SKU 对比，不默认生成不确定对比信息。',
  },
]

const CJK_ON_IMAGE_TEXT_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/

export function normalizeOnImageCopy(copy: string): string {
  return copy
    .replace(/\\n/g, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !CJK_ON_IMAGE_TEXT_RE.test(line))
    .join('\n')
}

export function buildAmazonPlanPrompt(plan: Pick<AmazonImagePlan, 'kind' | 'copy' | 'prompt'>): string {
  const prompt = plan.prompt.trim()
  const copy = normalizeOnImageCopy(plan.copy)
  if (!copy || plan.kind === 'main') return prompt
  if (/on-image copy to render exactly:/i.test(prompt)) return prompt

  return [
    prompt,
    '',
    'On-image copy to render exactly:',
    `"${copy}"`,
    '',
    'Render this text cleanly and legibly. Do not add any other text, prices, reviews, ratings, badges, or marketplace marks.',
  ].join('\n')
}

function formatAPlusUploadSize(spec: Pick<AmazonAPlusModuleSpec, 'uploadWidth' | 'uploadHeight'>): string {
  return `${spec.uploadWidth}x${spec.uploadHeight}`
}

function getSafeAPlusRatio(width: number, height: number): string {
  const ratio = width / height
  if (ratio > 3) return '3:1'
  if (ratio < 1 / 3) return '1:3'
  return `${width}:${height}`
}

function getAPlusGenerationSizeFromDimensions(width: number, height: number, tier: SizeTier): string {
  return calculateImageSize(tier, getSafeAPlusRatio(width, height)) ?? (tier === '4K' ? '2880x2880' : '2048x2048')
}

export function getAPlusModuleSpecs(type: APlusContentType): AmazonAPlusModuleSpec[] {
  switch (type) {
    case 'premium':
      return PREMIUM_A_PLUS_MODULE_SPECS
    case 'standard-large':
      return STANDARD_LARGE_A_PLUS_MODULE_SPECS
    default:
      return STANDARD_A_PLUS_MODULE_SPECS
  }
}

export function findAPlusModuleSpec(slot: string): AmazonAPlusModuleSpec | undefined {
  return [...STANDARD_A_PLUS_MODULE_SPECS, ...STANDARD_LARGE_A_PLUS_MODULE_SPECS, ...PREMIUM_A_PLUS_MODULE_SPECS, ...OPTIONAL_A_PLUS_MODULE_SPECS]
    .find((spec) => spec.slot === slot)
}

export function getAPlusContentTypeLabel(type: APlusContentType): string {
  switch (type) {
    case 'premium':
      return 'Premium'
    case 'standard-large':
      return '大图版'
    default:
      return 'Standard'
  }
}

export function getAPlusModuleDisplayName(module: Pick<AmazonAPlusPlan, 'slot' | 'moduleType'> | Pick<AmazonAPlusModuleSpec, 'slot' | 'moduleType'>): string {
  const spec = findAPlusModuleSpec(module.slot)
  if (spec) return spec.displayLabel

  switch (module.moduleType) {
    case 'header-banner':
      return '顶部横幅'
    case 'single-image':
      return '大图模块'
    case 'highlight-tile':
      return '卖点方块'
    case 'hero-banner':
      return '高级首屏横幅'
    case 'feature-image':
      return '高级大图模块'
    case 'brand-story':
      return '品牌故事'
    case 'logo':
      return '品牌 Logo'
    case 'comparison-thumbnail':
      return '对比缩略图'
    default:
      return 'A+ 模块'
  }
}

export function getAPlusModuleEnglishName(module: Pick<AmazonAPlusPlan, 'slot' | 'label' | 'moduleType'> | Pick<AmazonAPlusModuleSpec, 'slot' | 'label' | 'moduleType'>): string {
  return findAPlusModuleSpec(module.slot)?.label ?? module.label ?? module.moduleType
}

export function isAPlusTextModule(module: Pick<AmazonAPlusPlan, 'moduleType'> | Pick<AmazonAPlusModuleSpec, 'moduleType'>): boolean {
  return module.moduleType === 'highlight-tile'
}

export function formatAPlusModuleText(plan: Pick<AmazonAPlusPlan, 'textTitle' | 'textBody'>): string {
  return [plan.textTitle.trim(), plan.textBody.trim()].filter(Boolean).join('\n\n')
}

export function getAPlusModuleUploadSize(spec: Pick<AmazonAPlusModuleSpec, 'uploadWidth' | 'uploadHeight'>): string {
  return formatAPlusUploadSize(spec)
}

export function getAPlusModuleGenerationSize(spec: Pick<AmazonAPlusModuleSpec, 'uploadWidth' | 'uploadHeight'>, tier: SizeTier): string {
  return getAPlusGenerationSizeFromDimensions(spec.uploadWidth, spec.uploadHeight, tier)
}

export function getAPlusPlanGenerationSize(plan: Pick<AmazonAPlusPlan, 'slot' | 'uploadSize'>, tier: SizeTier): string {
  const spec = findAPlusModuleSpec(plan.slot)
  if (spec) return getAPlusModuleGenerationSize(spec, tier)

  const match = plan.uploadSize.match(/^(\d+)x(\d+)$/)
  if (!match) return tier === '4K' ? '2880x2880' : '2048x2048'
  return getAPlusGenerationSizeFromDimensions(Number(match[1]), Number(match[2]), tier)
}

export function withAPlusGenerationSizes(plans: AmazonAPlusPlan[], tier: SizeTier): AmazonAPlusPlan[] {
  return plans.map((plan) => ({
    ...plan,
    generationSize: getAPlusPlanGenerationSize(plan, tier),
  }))
}

export function buildAmazonAPlusPlanPrompt(plan: Pick<AmazonAPlusPlan, 'moduleType' | 'uploadSize' | 'generationSize' | 'copy' | 'prompt'>): string {
  const prompt = plan.prompt.trim()
  if (/a\+ module requirements:/i.test(prompt)) return prompt

  const copy = normalizeOnImageCopy(plan.copy)
  const copyBlock = copy
    ? [
        'On-image copy to render exactly:',
        `"${copy}"`,
        'Render this text cleanly, with large mobile-readable typography and no extra text.',
      ]
    : [
        'Do not add on-image text unless it is physically present on the product or packaging reference.',
      ]

  return [
    prompt,
    '',
    'A+ module requirements:',
    `- Module type: ${plan.moduleType}.`,
    `- Final Seller Central recommended upload size: ${plan.uploadSize}px.`,
    `- Generate at ${plan.generationSize}px while keeping all essential product details and text inside a central safe area that can be cropped/exported to ${plan.uploadSize}px.`,
    '- RGB color space, sharp commercial product photography, clean layout, consistent brand style, high resolution, no pixelation.',
    ...copyBlock.map((line) => `- ${line}`),
    '- Do not include prices, discounts, coupons, free shipping, QR codes, phone numbers, email addresses, external URLs, reviews, star ratings, Amazon/Prime/Alexa/Amazon Choice/Best Seller badges, competitor names, unsupported guarantees, or medical/eco claims without proof.',
  ].join('\n')
}
