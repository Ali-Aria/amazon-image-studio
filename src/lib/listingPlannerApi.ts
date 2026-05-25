import type { ApiProfile } from '../types'
import { DEFAULT_RESPONSES_MODEL } from './apiProfiles'
import { buildApiUrl, readClientDevProxyConfig, shouldUseApiProxy } from './devProxy'
import { getApiErrorMessage } from './imageApiShared'
import type { AmazonPromptDraft } from './amazonPrompt'
import {
  getAPlusContentTypeLabel,
  getAPlusModuleGenerationSize,
  getAPlusModuleSpecs,
  getAPlusModuleUploadSize,
  normalizeOnImageCopy,
  type APlusContentType,
  type AmazonAPlusPlan,
  type AmazonImagePlan,
  type AmazonPlannerMode,
  type ListingParseResult,
} from './listingPlanner'
import { isEventStreamResponse, looksLikeServerSentEvents, readJsonServerSentEvents, readJsonServerSentEventText } from './serverSentEvents'
import type { SizeTier } from './size'

interface PlannerApiPayload {
  product?: {
    title?: string
    category?: string
    color?: string
    material?: string
    audience?: string
    packageIncludes?: string
  }
  sellingPoints?: string[]
  imagePlans?: AmazonImagePlan[]
  aPlusPlans?: Array<Partial<AmazonAPlusPlan>>
}

export interface PlannerApiResult {
  mode: AmazonPlannerMode
  parsed: ListingParseResult
  plans: AmazonImagePlan[]
  aPlusPlans: AmazonAPlusPlan[]
  aPlusType?: APlusContentType
}

const PRODUCT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    category: { type: 'string' },
    color: { type: 'string' },
    material: { type: 'string' },
    audience: { type: 'string' },
    packageIncludes: { type: 'string' },
  },
  required: ['title', 'category', 'color', 'material', 'audience', 'packageIncludes'],
} as const

const SELLING_POINTS_SCHEMA = {
  type: 'array',
  minItems: 1,
  maxItems: 5,
  items: { type: 'string' },
} as const

const CHINESE_LABEL_SCHEMA = {
  type: 'string',
  description: 'Concise Simplified Chinese label for UI display.',
} as const

const ENGLISH_ON_IMAGE_COPY_SCHEMA = {
  type: 'string',
  description: 'Short natural US-English on-image text only, or an empty string. This value is injected verbatim into the image-generation prompt; never include Chinese characters.',
} as const

const ENGLISH_IMAGE_PROMPT_SCHEMA = {
  type: 'string',
  description: 'Professional English image-generation prompt only. Never include Chinese characters.',
} as const

const LISTING_PLANNER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    product: PRODUCT_SCHEMA,
    sellingPoints: SELLING_POINTS_SCHEMA,
    imagePlans: {
      type: 'array',
      minItems: 7,
      maxItems: 7,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slot: { type: 'string', enum: ['MAIN', 'PT01', 'PT02', 'PT03', 'PT04', 'PT05', 'PT06'] },
          label: CHINESE_LABEL_SCHEMA,
          kind: { type: 'string', enum: ['main', 'lifestyle', 'detail', 'scale', 'bundle', 'steps'] },
          objective: { type: 'string' },
          concept: { type: 'string' },
          copy: ENGLISH_ON_IMAGE_COPY_SCHEMA,
          compliance: { type: 'string' },
          scene: { type: 'string' },
          prompt: ENGLISH_IMAGE_PROMPT_SCHEMA,
        },
        required: ['slot', 'label', 'kind', 'objective', 'concept', 'copy', 'compliance', 'scene', 'prompt'],
      },
    },
  },
  required: ['product', 'sellingPoints', 'imagePlans'],
} as const

function createAPlusPlannerSchema(aPlusType: APlusContentType) {
  const specs = getAPlusModuleSpecs(aPlusType)
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      product: PRODUCT_SCHEMA,
      sellingPoints: SELLING_POINTS_SCHEMA,
      aPlusPlans: {
        type: 'array',
        minItems: specs.length,
        maxItems: specs.length,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            slot: { type: 'string', enum: specs.map((spec) => spec.slot) },
            label: CHINESE_LABEL_SCHEMA,
            moduleType: { type: 'string', enum: Array.from(new Set(specs.map((spec) => spec.moduleType))) },
            objective: { type: 'string' },
            concept: { type: 'string' },
            copy: ENGLISH_ON_IMAGE_COPY_SCHEMA,
            textTitle: { type: 'string' },
            textBody: { type: 'string' },
            compliance: { type: 'string' },
            scene: { type: 'string' },
            prompt: ENGLISH_IMAGE_PROMPT_SCHEMA,
          },
          required: ['slot', 'label', 'moduleType', 'objective', 'concept', 'copy', 'textTitle', 'textBody', 'compliance', 'scene', 'prompt'],
        },
      },
    },
    required: ['product', 'sellingPoints', 'aPlusPlans'],
  } as const
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>
  if (typeof record.output_text === 'string') return record.output_text

  const output = Array.isArray(record.output) ? record.output : []
  const chunks: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const itemRecord = item as Record<string, unknown>
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : []
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const partRecord = part as Record<string, unknown>
      if (typeof partRecord.text === 'string') chunks.push(partRecord.text)
    }
  }
  return chunks.join('\n').trim()
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getStringValue(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value ? value : undefined
}

function parsePlannerPayload(text: string): PlannerApiPayload {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]
  return JSON.parse(fenced ?? trimmed) as PlannerApiPayload
}

function getPlannerPayloadFromEvent(event: Record<string, unknown>): unknown {
  if (isRecordValue(event.response)) return event.response
  if (isRecordValue(event.item)) return { output: [event.item] }
  return null
}

function getPlannerTextFromEvent(event: Record<string, unknown>): string {
  const payloadText = extractResponseText(getPlannerPayloadFromEvent(event))
  if (payloadText) return payloadText

  const text = getStringValue(event, 'text')
  if (text) return text

  const part = event.part
  if (isRecordValue(part)) {
    const partText = getStringValue(part, 'text')
    if (partText) return partText
  }

  return ''
}

async function readPlannerTextFromSseResponse(response: Response): Promise<string> {
  let completedText = ''
  let outputItemText = ''
  let doneText = ''
  let deltaText = ''

  await readJsonServerSentEvents(response, (event) => {
    const type = getStringValue(event, 'type')
    if (type === 'response.output_text.delta') {
      deltaText += getStringValue(event, 'delta') ?? ''
      return
    }

    const text = getPlannerTextFromEvent(event)
    if (!text) return

    if (type === 'response.completed') completedText = text
    else if (type === 'response.output_item.done') outputItemText = text
    else if (type === 'response.output_text.done' || type === 'response.content_part.done') doneText = text
  })

  return completedText.trim() || outputItemText.trim() || doneText.trim() || deltaText.trim()
}

async function readPlannerTextFromSseText(rawText: string): Promise<string> {
  let completedText = ''
  let outputItemText = ''
  let doneText = ''
  let deltaText = ''

  await readJsonServerSentEventText(rawText, (event) => {
    const type = getStringValue(event, 'type')
    if (type === 'response.output_text.delta') {
      deltaText += getStringValue(event, 'delta') ?? ''
      return
    }

    const text = getPlannerTextFromEvent(event)
    if (!text) return

    if (type === 'response.completed') completedText = text
    else if (type === 'response.output_item.done') outputItemText = text
    else if (type === 'response.output_text.done' || type === 'response.content_part.done') doneText = text
  })

  return completedText.trim() || outputItemText.trim() || doneText.trim() || deltaText.trim()
}

function isJsonContentType(contentType: string): boolean {
  return contentType.includes('application/json') || contentType.includes('+json')
}

function truncateForError(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= 1200) return trimmed
  return `${trimmed.slice(0, 1200)}...`
}

async function readPlannerResponseText(response: Response): Promise<string> {
  if (isEventStreamResponse(response)) {
    const text = await readPlannerTextFromSseResponse(response)
    if (!text) throw new Error('AI 策划流式接口未返回文本内容')
    return text
  }

  const rawText = await response.text()
  if (!rawText.trim()) throw new Error('AI 策划接口返回空内容')

  if (looksLikeServerSentEvents(rawText)) {
    const text = await readPlannerTextFromSseText(rawText)
    if (!text) throw new Error('AI 策划流式接口未返回文本内容')
    return text
  }

  const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? ''
  if (!isJsonContentType(contentType) && !/^[{\[]/.test(rawText.trimStart())) {
    throw new Error(`AI 策划接口返回了非 JSON 内容：${truncateForError(rawText)}`)
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawText)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`AI 策划接口返回了无法解析的 JSON：${message}\n\n${truncateForError(rawText)}`)
  }

  const text = extractResponseText(payload)
  if (!text) throw new Error('AI 策划接口未返回文本内容')
  return text
}

function normalizePlan(plan: AmazonImagePlan, index: number): AmazonImagePlan {
  const slots = ['MAIN', 'PT01', 'PT02', 'PT03', 'PT04', 'PT05', 'PT06']
  return {
    slot: plan.slot || slots[index] || `PT${String(index).padStart(2, '0')}`,
    label: plan.label || '图片方案',
    kind: plan.kind,
    objective: plan.objective || '',
    concept: plan.concept || '',
    copy: normalizeOnImageCopy(plan.copy || ''),
    compliance: plan.compliance || '',
    scene: plan.scene || '',
    prompt: plan.prompt || '',
  }
}

function normalizeParsedListing(payload: PlannerApiPayload): ListingParseResult {
  const product = payload.product ?? {}
  const sellingPoints = Array.isArray(payload.sellingPoints)
    ? payload.sellingPoints.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 5)
    : []

  if (!product.title?.trim()) throw new Error('AI 策划结果缺少商品标题')

  return {
    title: product.title.trim(),
    bullets: sellingPoints,
    inferred: {
      productTitle: product.title.trim(),
      category: product.category?.trim() ?? '',
      color: product.color?.trim() ?? '',
      material: product.material?.trim() ?? '',
      audience: product.audience?.trim() ?? '',
      packageIncludes: product.packageIncludes?.trim() ?? '',
      sellingPoints: sellingPoints.join('\n'),
    },
  }
}

function normalizeListingPlannerApiPayload(payload: PlannerApiPayload): PlannerApiResult {
  const parsed = normalizeParsedListing(payload)
  const plans = Array.isArray(payload.imagePlans)
    ? payload.imagePlans.map(normalizePlan).filter((plan) => plan.prompt.trim()).slice(0, 7)
    : []

  if (plans.length !== 7) throw new Error('AI 策划结果不是 7 张图')

  return {
    mode: 'listing',
    parsed,
    plans,
    aPlusPlans: [],
  }
}

function normalizeAPlusPlan(
  plan: Partial<AmazonAPlusPlan> | undefined,
  index: number,
  aPlusType: APlusContentType,
  tier: SizeTier,
): AmazonAPlusPlan {
  const spec = getAPlusModuleSpecs(aPlusType)[index]
  if (!spec) throw new Error('A+ 模块规格不存在')

  return {
    slot: plan?.slot || spec.slot,
    label: plan?.label || spec.label,
    moduleType: plan?.moduleType || spec.moduleType,
    uploadSize: getAPlusModuleUploadSize(spec),
    generationSize: getAPlusModuleGenerationSize(spec, tier),
    objective: plan?.objective || spec.objective,
    concept: plan?.concept || '',
    copy: normalizeOnImageCopy(plan?.copy || ''),
    textTitle: plan?.textTitle || '',
    textBody: plan?.textBody || '',
    compliance: plan?.compliance || '',
    scene: plan?.scene || '',
    prompt: plan?.prompt || '',
  }
}

function normalizeAPlusPlannerApiPayload(payload: PlannerApiPayload, aPlusType: APlusContentType, tier: SizeTier): PlannerApiResult {
  const parsed = normalizeParsedListing(payload)
  const specs = getAPlusModuleSpecs(aPlusType)
  const rawPlans = Array.isArray(payload.aPlusPlans) ? payload.aPlusPlans : []
  if (rawPlans.length !== specs.length) throw new Error(`AI A+ 策划结果不是 ${specs.length} 个模块`)

  const aPlusPlans = specs.map((spec, index) => {
    const bySlot = rawPlans.find((plan) => plan?.slot === spec.slot)
    return normalizeAPlusPlan(bySlot ?? rawPlans[index], index, aPlusType, tier)
  })

  const emptyPrompt = aPlusPlans.find((plan) => !plan.prompt.trim())
  if (emptyPrompt) throw new Error(`AI A+ 策划结果缺少 ${emptyPrompt.slot} 的提示词`)

  return {
    mode: 'aplus',
    parsed,
    plans: [],
    aPlusPlans,
    aPlusType,
  }
}

function buildListingPlannerInstructions(baseDraft: AmazonPromptDraft) {
  return [
    'You are a senior Amazon US visual director with 10 years of marketplace image planning experience.',
    'Create a conversion-focused image plan for exactly 7 Amazon listing images: MAIN, PT01, PT02, PT03, PT04, PT05, PT06.',
    'Strictly follow Amazon image compliance: main image must be pure white RGB 255,255,255, product fills about 85% of frame, no text, no logos, no watermark, no props. Secondary images must not include Amazon/Prime/Alexa/Amazon Choice/Best Seller/hot sale badges, reviews, star ratings, pricing, coupons, shipping claims, or unsupported claims.',
    'Each image plan must include a concise Chinese label, objective, visual concept, on-image copy if useful, compliance statement, scene direction, and a professional English image-generation prompt.',
    'Field language rules are strict: label must be Simplified Chinese; copy must be short natural US-English on-image text or an empty string; prompt must be fully English. Never output Chinese characters in copy or prompt, even if the source listing is Chinese.',
    'The MAIN prompt must include exactly this mandatory phrase: on a seamless pure white background RGB 255, 255, 255, professional studio lighting, product takes up 85% of the frame, high resolution, photorealistic.',
    'Do not generate images. Only return JSON matching the schema.',
    baseDraft.category ? `Known category: ${baseDraft.category}` : '',
    baseDraft.forbidden ? `Extra forbidden visual elements: ${baseDraft.forbidden}` : '',
  ].filter(Boolean).join('\n')
}

function getAPlusPlannerTypeName(aPlusType: APlusContentType) {
  switch (aPlusType) {
    case 'premium':
      return 'Premium A+ Content'
    case 'standard-large':
      return 'Standard A+ Content large-image template'
    default:
      return 'Standard A+ Content'
  }
}

function buildAPlusPlannerInstructions(baseDraft: AmazonPromptDraft, aPlusType: APlusContentType) {
  const specs = getAPlusModuleSpecs(aPlusType)
  const typeLabel = getAPlusPlannerTypeName(aPlusType)
  return [
    'You are a senior Amazon US A+ Content visual director with 10 years of marketplace conversion design experience.',
    `Create a ${typeLabel} image module plan. Do not generate images. Only return JSON matching the schema.`,
    `Return exactly ${specs.length} modules in this order: ${specs.map((spec) => `${spec.slot} ${spec.label} ${getAPlusModuleUploadSize(spec)}px`).join('; ')}.`,
    'A+ images must be unique to the product and brand story; avoid repeating the exact same gallery images.',
    aPlusType === 'standard-large'
      ? 'For this large-image template, create one 970x300 header banner and four 970x600 single-image modules. Do not add Highlight Tile modules.'
      : '',
    'Each module must include a concise Chinese label, objective, visual concept, mobile-readable on-image copy only if it should be rendered inside the image, optional external A+ textTitle/textBody, compliance statement, scene direction, and a professional English image-generation prompt.',
    'Field language rules are strict: label must be Simplified Chinese; copy, textTitle, and textBody must be short natural US-English text or empty strings; prompt must be fully English. Never output Chinese characters in copy or prompt, even if the source listing is Chinese.',
    'For Standard Highlight Tile modules (A+S05-A+S08), write textTitle as a short US-English benefit headline and textBody as 1-2 concise US-English sentences for the text area beside or below the 220x220 image.',
    'For non Highlight Tile modules, leave textTitle and textBody empty unless the module genuinely needs separate text outside the image.',
    'Image-generation prompts must not render textTitle/textBody as on-image text. Use copy only for text that belongs inside the generated image, and prefer empty copy for 220x220 Highlight Tile images.',
    'A+ compliance: RGB image, clear and non-blurry, no watermark, no tiny unreadable text, no prices, promotions, discounts, coupons, free shipping, QR codes, phone numbers, email addresses, external URLs, customer reviews, star ratings, Amazon/Prime/Alexa/Amazon Choice/Best Seller badges, competitor mentions, unsupported guarantees, or unsubstantiated medical/eco claims.',
    'Use a cohesive commercial visual system across modules: consistent lighting, color palette, product scale, typography direction, and truthful included accessories.',
    'Prompts should describe the intended module composition and leave enough safe area for final A+ cropping.',
    baseDraft.category ? `Known category: ${baseDraft.category}` : '',
    baseDraft.brand ? `Known brand/model: ${baseDraft.brand}` : '',
    baseDraft.forbidden ? `Extra forbidden visual elements: ${baseDraft.forbidden}` : '',
  ].filter(Boolean).join('\n')
}

function buildPlannerInstructions(baseDraft: AmazonPromptDraft, mode: AmazonPlannerMode, aPlusType: APlusContentType) {
  return mode === 'aplus'
    ? buildAPlusPlannerInstructions(baseDraft, aPlusType)
    : buildListingPlannerInstructions(baseDraft)
}

function buildPlannerInputText(listingText: string, mode: AmazonPlannerMode, aPlusType: APlusContentType) {
  if (mode === 'aplus') {
    const specs = getAPlusModuleSpecs(aPlusType)
    return [
      `Parse this Amazon listing copy and produce the ${getAPlusContentTypeLabel(aPlusType)} A+ Content module plan.`,
      'Use the title and bullet points from the pasted text. If a field is uncertain, infer conservatively from the listing.',
      `Use these A+ modules exactly: ${specs.map((spec) => spec.slot).join(', ')}.`,
      '',
      listingText,
    ].join('\n')
  }

  return [
    'Parse this Amazon listing copy and produce the 7-image visual plan.',
    'Use the title and bullet points from the pasted text. If a field is uncertain, infer conservatively from the listing.',
    '',
    listingText,
  ].join('\n')
}

export async function callAmazonPlannerApi(options: {
  listingText: string
  baseDraft: AmazonPromptDraft
  profile: ApiProfile
  model?: string
  mode?: AmazonPlannerMode
  aPlusType?: APlusContentType
  aPlusGenerationTier?: SizeTier
}): Promise<PlannerApiResult> {
  const model = options.model?.trim() || options.profile.model.trim() || DEFAULT_RESPONSES_MODEL
  const mode = options.mode ?? 'listing'
  const aPlusType = options.aPlusType ?? 'standard-large'
  const aPlusGenerationTier = options.aPlusGenerationTier ?? '2K'
  const schema = mode === 'aplus' ? createAPlusPlannerSchema(aPlusType) : LISTING_PLANNER_SCHEMA
  const proxyConfig = readClientDevProxyConfig()
  const useApiProxy = shouldUseApiProxy(options.profile.apiProxy, proxyConfig)
  const response = await fetch(buildApiUrl(options.profile.baseUrl, 'responses', proxyConfig, useApiProxy), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.profile.apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      model,
      instructions: buildPlannerInstructions(options.baseDraft, mode, aPlusType),
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildPlannerInputText(options.listingText, mode, aPlusType),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: mode === 'aplus' ? 'amazon_aplus_image_plan' : 'amazon_listing_image_plan',
          strict: true,
          schema,
        },
      },
      stream: false,
    }),
  })

  if (!response.ok) {
    const message = await getApiErrorMessage(response)
    throw new Error(`HTTP ${response.status}: ${message}`)
  }
  const text = await readPlannerResponseText(response)
  const payload = parsePlannerPayload(text)
  return mode === 'aplus'
    ? normalizeAPlusPlannerApiPayload(payload, aPlusType, aPlusGenerationTier)
    : normalizeListingPlannerApiPayload(payload)
}
