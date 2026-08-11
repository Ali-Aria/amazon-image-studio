import type { AmazonImageKind, AmazonPromptDraft } from './amazonPrompt'
import type { AmazonStyleDensityMode } from '../types'
import { calculateImageSize, type SizeTier } from './size'
import { getAmazonMarketplace, type AmazonMarketplaceId } from './amazonMarketplaces'

export type AmazonPlannerMode = 'listing' | 'aplus'
export type { AmazonStyleDensityMode } from '../types'
export type APlusContentType = 'standard' | 'standard-large' | 'premium' | 'mobile'
export type APlusModuleKind =
  | 'header-banner'
  | 'single-image'
  | 'highlight-tile'
  | 'hero-banner'
  | 'feature-image'
  | 'brand-story'
  | 'logo'
  | 'comparison-thumbnail'

export const A_PLUS_CONTENT_TYPES: APlusContentType[] = ['standard-large', 'standard', 'premium', 'mobile']
export const MIN_A_PLUS_MODULE_COUNT = 1
export const MAX_A_PLUS_MODULE_COUNT = 12

const A_PLUS_MODULE_KINDS: APlusModuleKind[] = [
  'header-banner',
  'single-image',
  'highlight-tile',
  'hero-banner',
  'feature-image',
  'brand-story',
  'logo',
  'comparison-thumbnail',
]

export interface ListingParseResult {
  title: string
  bullets: string[]
  inferred: Partial<AmazonPromptDraft>
}

export interface AmazonImagePlan {
  slot: string
  label: string
  kind?: AmazonImageKind
  planMarkdown: string
  prompt: string
  negativePrompt: string
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
  planMarkdown: string
  textTitle: string
  textBody: string
  prompt: string
  negativePrompt: string
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

export const MOBILE_A_PLUS_MODULE_SPECS: AmazonAPlusModuleSpec[] = [
  {
    contentType: 'mobile',
    slot: 'A+M01',
    label: 'Mobile Hero',
    displayLabel: '手机首屏',
    moduleType: 'hero-banner',
    uploadWidth: 600,
    uploadHeight: 450,
    objective: '用移动端首屏图建立产品核心卖点和清晰视觉吸引力。',
  },
  ...Array.from({ length: 4 }, (_, index) => ({
    contentType: 'mobile' as const,
    slot: `A+M0${index + 2}`,
    label: `Mobile Feature ${index + 1}`,
    displayLabel: `手机卖点图 ${index + 1}`,
    moduleType: 'feature-image' as const,
    uploadWidth: 600,
    uploadHeight: 450,
    objective: '用移动端友好的 4:3 图片讲清一个关键卖点、细节证据或使用场景。',
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
const STYLE_REFERENCE_GUARD = [
  'Style reference rule:',
  '- The last input image is a hidden style reference selected by the user.',
  '- Use it only for color palette, lighting, contrast, material finish, typography feel, and overall visual polish.',
  '- The selected visual style text block is higher priority than any conflicting aesthetic language in the image task or series style guide.',
  '- Do not copy any placeholder words, fixed layout, color swatch positions, exact composition, product arrangement, product count, props, scene, or information density from the style reference board.',
  '- Follow the image task, layout density, and negative prompt sections for the actual content and arrangement.',
].join('\n')

export const DEFAULT_LISTING_IMAGE_COUNT = 7
export const MIN_LISTING_IMAGE_COUNT = 7
export const MAX_LISTING_IMAGE_COUNT = 12
export const LISTING_IMAGE_COUNT_OPTIONS = Array.from(
  { length: MAX_LISTING_IMAGE_COUNT - MIN_LISTING_IMAGE_COUNT + 1 },
  (_, index) => MIN_LISTING_IMAGE_COUNT + index,
)

export function normalizeListingImageCount(value: unknown): number {
  const count = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : DEFAULT_LISTING_IMAGE_COUNT
  if (!Number.isFinite(count)) return DEFAULT_LISTING_IMAGE_COUNT
  return Math.min(MAX_LISTING_IMAGE_COUNT, Math.max(MIN_LISTING_IMAGE_COUNT, Math.trunc(count)))
}

export function getAmazonListingImageSlots(count: unknown = DEFAULT_LISTING_IMAGE_COUNT): string[] {
  const normalizedCount = normalizeListingImageCount(count)
  return [
    'MAIN',
    ...Array.from({ length: normalizedCount - 1 }, (_, index) => `PT${String(index + 1).padStart(2, '0')}`),
  ]
}

export function formatAmazonListingSlotRange(count: unknown = DEFAULT_LISTING_IMAGE_COUNT): string {
  const slots = getAmazonListingImageSlots(count)
  const tailSlots = slots.slice(1)
  if (!tailSlots.length) return slots[0] ?? 'MAIN'
  return `MAIN + ${tailSlots[0]}-${tailSlots[tailSlots.length - 1]}`
}

export function isAmazonListingMainSlot(slot?: string | null): boolean {
  return slot?.trim().toUpperCase() === 'MAIN'
}

export function normalizeOnImageCopy(copy: string, marketplaceId?: AmazonMarketplaceId): string {
  const marketplace = getAmazonMarketplace(marketplaceId)
  return copy
    .replace(/\\n/g, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && (marketplace.allowsCjkVisibleCopy || !CJK_ON_IMAGE_TEXT_RE.test(line)))
    .join('\n')
}

function getStyleDensityGuide(mode: AmazonStyleDensityMode = 'rich', marketplaceId?: AmazonMarketplaceId): string {
  const marketplace = getAmazonMarketplace(marketplaceId)
  if (mode === 'minimal') {
    return [
      'Layout density:',
      '- Use a refined minimal Amazon layout with fewer callouts, generous balanced spacing, light icon or line treatment, and restrained visible copy.',
      `- Any customer-facing copy visible in the image must be concise, natural ${marketplace.onImageCopyLanguage} for ${marketplace.domain}.`,
      '- Keep the product and one or two strongest messages dominant, with clean hierarchy and no clutter.',
    ].join('\n')
  }

  return [
    'Layout density:',
    '- Use a polished, information-rich Amazon gallery layout when the selected image type benefits from explanation.',
    `- Build clear hierarchy with mobile-readable ${marketplace.onImageCopyLanguage} copy for ${marketplace.domain}, multiple well-spaced callouts, detail crops, comparison areas, measurement arrows, or use-case zones as appropriate.`,
    '- Keep the composition premium and organized; information-rich should still be readable, balanced, and uncluttered.',
  ].join('\n')
}

function formatPromptBlock(options: {
  prompt: string
  negativePrompt?: string
  seriesStyleGuide?: string | null
  styleReferenceAttached?: boolean
  styleDensityMode?: AmazonStyleDensityMode
  marketplaceId?: AmazonMarketplaceId
  selectedVisualStyle?: {
    label: string
    description: string
    palette: string[]
  } | null
}) {
  const selectedVisualStyle = options.styleReferenceAttached ? options.selectedVisualStyle : null
  const selectedStyleBlock = selectedVisualStyle
    ? [
      'Selected visual style (highest priority):',
      `- Style reference: ${selectedVisualStyle.label}.`,
      `- Style direction: ${selectedVisualStyle.description}`,
      selectedVisualStyle.palette.length ? `- Palette anchors: ${selectedVisualStyle.palette.join(', ')}.` : '',
      '- This selected visual style is the highest-priority visual system for background, palette, typography, lighting, decorative accents, material finish, and information-panel styling.',
      '- If the image task prompt or Series style guide contains a conflicting aesthetic, background mood, color palette, typography direction, or decorative accent, override that conflict with this selected visual style while preserving product facts and required copy.',
    ].filter(Boolean).join('\n')
    : ''
  const seriesStyleGuideLabel = selectedStyleBlock
    ? 'Series style guide (lower priority than the selected visual style):'
    : 'Series style guide:'
  const sections = [
    options.prompt.trim(),
    selectedStyleBlock,
    options.seriesStyleGuide?.trim()
      ? `${seriesStyleGuideLabel}\n${options.seriesStyleGuide.trim()}`
      : '',
    options.styleReferenceAttached ? getStyleDensityGuide(options.styleDensityMode, options.marketplaceId) : '',
    options.negativePrompt?.trim()
      ? `Negative prompt:\n${options.negativePrompt.trim()}`
      : '',
    options.styleReferenceAttached ? STYLE_REFERENCE_GUARD : '',
  ].filter(Boolean)

  return sections.join('\n\n')
}

export function buildAmazonPlanPrompt(plan: Pick<AmazonImagePlan, 'prompt' | 'negativePrompt'> & {
  seriesStyleGuide?: string | null
  styleReferenceAttached?: boolean
  styleDensityMode?: AmazonStyleDensityMode
  marketplaceId?: AmazonMarketplaceId
  selectedVisualStyle?: {
    label: string
    description: string
    palette: string[]
  } | null
}): string {
  return formatPromptBlock(plan)
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

function getAPlusModuleSlotPrefix(type: APlusContentType): string {
  switch (type) {
    case 'premium':
      return 'A+P'
    case 'mobile':
      return 'A+M'
    case 'standard-large':
      return 'A+L'
    default:
      return 'A+S'
  }
}

function isAPlusModuleKind(value: unknown): value is APlusModuleKind {
  return typeof value === 'string' && A_PLUS_MODULE_KINDS.includes(value as APlusModuleKind)
}

function getAPlusModuleTypeText(type: APlusContentType, moduleType: APlusModuleKind, ordinal: number) {
  const suffix = ordinal > 1 || !['header-banner', 'hero-banner', 'logo', 'comparison-thumbnail'].includes(moduleType)
    ? ` ${ordinal}`
    : ''

  switch (moduleType) {
    case 'header-banner':
      return {
        label: `Header Banner${suffix}`,
        displayLabel: `顶部横幅${suffix}`,
      }
    case 'single-image':
      return {
        label: `Single Image${suffix}`,
        displayLabel: `大图模块${suffix}`,
      }
    case 'highlight-tile':
      return {
        label: `Highlight Tile${suffix}`,
        displayLabel: `卖点方块${suffix}`,
      }
    case 'hero-banner':
      return type === 'mobile'
        ? {
            label: `Mobile Hero${suffix}`,
            displayLabel: `手机首屏${suffix}`,
          }
        : {
            label: `Hero Banner${suffix}`,
            displayLabel: `高级首屏横幅${suffix}`,
          }
    case 'feature-image':
      return type === 'mobile'
        ? {
            label: `Mobile Feature${suffix}`,
            displayLabel: `手机卖点图${suffix}`,
          }
        : {
            label: `Feature Image${suffix}`,
            displayLabel: `高级大图模块${suffix}`,
          }
    case 'brand-story':
      return {
        label: `Brand Story${suffix}`,
        displayLabel: `品牌故事${suffix}`,
      }
    case 'logo':
      return {
        label: `Logo Image${suffix}`,
        displayLabel: `品牌 Logo${suffix}`,
      }
    case 'comparison-thumbnail':
      return {
        label: `Comparison Thumbnail${suffix}`,
        displayLabel: `对比缩略图${suffix}`,
      }
    default:
      return {
        label: `A+ Module${suffix}`,
        displayLabel: `A+ 模块${suffix}`,
      }
  }
}

function cloneAPlusModuleSpec(spec: AmazonAPlusModuleSpec): AmazonAPlusModuleSpec {
  return { ...spec }
}

function normalizeAPlusDimension(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return Math.trunc(numeric)
}

export function normalizeAPlusModuleSpecs(
  type: APlusContentType,
  specs?: Array<Partial<AmazonAPlusModuleSpec>> | null,
): AmazonAPlusModuleSpec[] {
  const fallbackSpecs = getAPlusModuleSpecs(type)
  const sourceSpecs = Array.isArray(specs) && specs.length ? specs : fallbackSpecs
  const fallbackByModuleType = new Map(fallbackSpecs.map((spec) => [spec.moduleType, spec]))
  const moduleTypeCounts = new Map<APlusModuleKind, number>()
  const normalizedSource = sourceSpecs
    .slice(0, MAX_A_PLUS_MODULE_COUNT)
    .filter((spec) => isAPlusModuleKind(spec.moduleType))

  const safeSource = normalizedSource.length ? normalizedSource : fallbackSpecs
  return safeSource.slice(0, MAX_A_PLUS_MODULE_COUNT).map((spec, index) => {
    const fallback = fallbackByModuleType.get(spec.moduleType as APlusModuleKind) ?? fallbackSpecs[index] ?? fallbackSpecs[0]
    const moduleType = isAPlusModuleKind(spec.moduleType) ? spec.moduleType : fallback.moduleType
    const nextOrdinal = (moduleTypeCounts.get(moduleType) ?? 0) + 1
    moduleTypeCounts.set(moduleType, nextOrdinal)
    const text = getAPlusModuleTypeText(type, moduleType, nextOrdinal)
    return {
      contentType: type,
      slot: `${getAPlusModuleSlotPrefix(type)}${String(index + 1).padStart(2, '0')}`,
      label: text.label,
      displayLabel: text.displayLabel,
      moduleType,
      uploadWidth: normalizeAPlusDimension(spec.uploadWidth, fallback.uploadWidth),
      uploadHeight: normalizeAPlusDimension(spec.uploadHeight, fallback.uploadHeight),
      objective: typeof spec.objective === 'string' && spec.objective.trim() ? spec.objective : fallback.objective,
    }
  })
}

export function insertAPlusModuleSpecAfter(
  type: APlusContentType,
  specs: Array<Partial<AmazonAPlusModuleSpec>>,
  index: number,
): AmazonAPlusModuleSpec[] {
  const normalizedSpecs = normalizeAPlusModuleSpecs(type, specs)
  if (normalizedSpecs.length >= MAX_A_PLUS_MODULE_COUNT) return normalizedSpecs
  const insertIndex = Math.min(Math.max(index, 0), normalizedSpecs.length - 1)
  const source = normalizedSpecs[insertIndex] ?? normalizedSpecs[normalizedSpecs.length - 1]
  return normalizeAPlusModuleSpecs(type, [
    ...normalizedSpecs.slice(0, insertIndex + 1),
    cloneAPlusModuleSpec(source),
    ...normalizedSpecs.slice(insertIndex + 1),
  ])
}

export function removeAPlusModuleSpecAt(
  type: APlusContentType,
  specs: Array<Partial<AmazonAPlusModuleSpec>>,
  index: number,
): AmazonAPlusModuleSpec[] {
  const normalizedSpecs = normalizeAPlusModuleSpecs(type, specs)
  if (normalizedSpecs.length <= MIN_A_PLUS_MODULE_COUNT) return normalizedSpecs
  const removeIndex = Math.min(Math.max(index, 0), normalizedSpecs.length - 1)
  return normalizeAPlusModuleSpecs(type, normalizedSpecs.filter((_, itemIndex) => itemIndex !== removeIndex))
}

export function areAPlusModuleSpecsEquivalent(
  left: Array<Partial<AmazonAPlusModuleSpec>>,
  right: Array<Partial<AmazonAPlusModuleSpec>>,
): boolean {
  if (left.length !== right.length) return false
  return left.every((spec, index) => {
    const other = right[index]
    return spec.moduleType === other?.moduleType &&
      spec.uploadWidth === other.uploadWidth &&
      spec.uploadHeight === other.uploadHeight
  })
}

export function getAPlusModuleSpecs(type: APlusContentType): AmazonAPlusModuleSpec[] {
  switch (type) {
    case 'premium':
      return PREMIUM_A_PLUS_MODULE_SPECS.map(cloneAPlusModuleSpec)
    case 'mobile':
      return MOBILE_A_PLUS_MODULE_SPECS.map(cloneAPlusModuleSpec)
    case 'standard-large':
      return STANDARD_LARGE_A_PLUS_MODULE_SPECS.map(cloneAPlusModuleSpec)
    default:
      return STANDARD_A_PLUS_MODULE_SPECS.map(cloneAPlusModuleSpec)
  }
}

export function findAPlusModuleSpec(slot: string): AmazonAPlusModuleSpec | undefined {
  return [...STANDARD_A_PLUS_MODULE_SPECS, ...STANDARD_LARGE_A_PLUS_MODULE_SPECS, ...PREMIUM_A_PLUS_MODULE_SPECS, ...MOBILE_A_PLUS_MODULE_SPECS, ...OPTIONAL_A_PLUS_MODULE_SPECS]
    .find((spec) => spec.slot === slot)
}

export function getAPlusContentTypeLabel(type: APlusContentType): string {
  switch (type) {
    case 'premium':
      return '高级A+'
    case 'mobile':
      return '手机A+'
    case 'standard-large':
      return '普通A+'
    default:
      return '标准A+'
  }
}

export function getAPlusModuleDisplayName(module: (Pick<AmazonAPlusPlan, 'slot' | 'moduleType'> | Pick<AmazonAPlusModuleSpec, 'slot' | 'moduleType'>) & { displayLabel?: string }): string {
  if (module.displayLabel) return module.displayLabel
  const spec = findAPlusModuleSpec(module.slot)
  if (spec && spec.moduleType === module.moduleType) return spec.displayLabel

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
  const spec = findAPlusModuleSpec(module.slot)
  if (spec && spec.moduleType === module.moduleType) return spec.label
  return module.label ?? module.moduleType
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
  const match = plan.uploadSize.match(/^(\d+)x(\d+)$/)
  if (match) return getAPlusGenerationSizeFromDimensions(Number(match[1]), Number(match[2]), tier)

  const spec = findAPlusModuleSpec(plan.slot)
  if (spec) return getAPlusModuleGenerationSize(spec, tier)
  return tier === '4K' ? '2880x2880' : '2048x2048'
}

export function withAPlusGenerationSizes(plans: AmazonAPlusPlan[], tier: SizeTier): AmazonAPlusPlan[] {
  return plans.map((plan) => ({
    ...plan,
    generationSize: getAPlusPlanGenerationSize(plan, tier),
  }))
}

export function buildAmazonAPlusPlanPrompt(plan: Pick<AmazonAPlusPlan, 'prompt' | 'negativePrompt'> & {
  seriesStyleGuide?: string | null
  styleReferenceAttached?: boolean
  styleDensityMode?: AmazonStyleDensityMode
  marketplaceId?: AmazonMarketplaceId
  selectedVisualStyle?: {
    label: string
    description: string
    palette: string[]
  } | null
}): string {
  return formatPromptBlock(plan)
}
