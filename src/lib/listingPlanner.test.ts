import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHAT_MODEL, createDefaultOpenAIProfile } from './apiProfiles'
import { DEFAULT_AMAZON_PROMPT_DRAFT } from './amazonPrompt'
import {
  buildAmazonAPlusPlanPrompt,
  buildAmazonPlanPrompt,
  formatAPlusModuleText,
  insertAPlusModuleSpecAfter,
  MAX_A_PLUS_MODULE_COUNT,
  getAPlusContentTypeLabel,
  getAPlusModuleDisplayName,
  getAPlusModuleEnglishName,
  getAPlusModuleSpecs,
  isAmazonListingMainSlot,
  removeAPlusModuleSpecAt,
} from './listingPlanner'
import { callAmazonPlannerApi } from './listingPlannerApi'

const SAMPLE_LISTING = [
  'Title: 40 oz Stainless Steel Insulated Tumbler with Handle and Straw Lid, Matte Black',
  '',
  'About this item',
  '- Keeps drinks cold for 24 hours and hot for 8 hours with double wall vacuum insulation',
  '- Ergonomic handle and slim base fit most car cup holders for commuting and travel',
  '- Leak resistant straw lid and splash proof design for daily use',
  '- Durable 18/8 stainless steel with matte powder coated finish',
  '- Includes reusable straw and cleaning brush, BPA free materials',
].join('\n')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Amazon prompt builders', () => {
  it('uses LLM prompt content, series style guide, density guidance, negative prompt, and optional style guard', () => {
    const prompt = buildAmazonPlanPrompt({
      prompt: 'Professional Amazon main image of the exact product.',
      negativePrompt: 'text, logo, extra accessories',
      seriesStyleGuide: 'Use warm studio light and refined charcoal typography across the set.',
      styleReferenceAttached: true,
      styleDensityMode: 'rich',
    })

    expect(prompt).toContain('Professional Amazon main image of the exact product.')
    expect(prompt).toContain('Series style guide:')
    expect(prompt).toContain('Use warm studio light')
    expect(prompt).toContain('Negative prompt:')
    expect(prompt).toContain('text, logo, extra accessories')
    expect(prompt).toContain('Layout density:')
    expect(prompt).toContain('information-rich Amazon gallery layout')
    expect(prompt).toContain('multiple well-spaced callouts')
    expect(prompt).toContain('The last input image is a hidden style reference')
    expect(prompt).toContain('color palette, lighting, contrast')
    expect(prompt).toContain('typography feel')
    expect(prompt).toContain('Do not copy any placeholder words, fixed layout')
    expect(prompt).not.toContain('Render only the copy specified below')
    expect(prompt).not.toContain('A+ module requirements:')
  })

  it('prioritizes the selected visual style over conflicting series style language', () => {
    const prompt = buildAmazonPlanPrompt({
      prompt: 'Create an Amazon secondary infographic image of the exact product.',
      negativePrompt: 'price, reviews',
      seriesStyleGuide: 'Use warm cream backgrounds, botanical accents, and coastal resort styling.',
      styleReferenceAttached: true,
      styleDensityMode: 'rich',
      selectedVisualStyle: {
        label: '清爽科技',
        description: '冷色光感、干净层级、精准标注，适合电子、工具、办公类产品。',
        palette: ['#F8FAFC', '#38BDF8', '#14B8A6'],
      },
    })

    expect(prompt).toContain('Selected visual style (highest priority):')
    expect(prompt).toContain('Style reference: 清爽科技.')
    expect(prompt).toContain('冷色光感、干净层级、精准标注')
    expect(prompt).toContain('Palette anchors: #F8FAFC, #38BDF8, #14B8A6.')
    expect(prompt).toContain('highest-priority visual system')
    expect(prompt).toContain('override that conflict with this selected visual style')
    expect(prompt).toContain('Series style guide (lower priority than the selected visual style):')
    expect(prompt).toContain('Use warm cream backgrounds')
    expect(prompt).toContain('The selected visual style text block is higher priority')
  })

  it('builds minimal density guidance when requested', () => {
    const prompt = buildAmazonPlanPrompt({
      prompt: 'Create an Amazon secondary image.',
      negativePrompt: 'price, reviews',
      seriesStyleGuide: 'Refined kitchen styling.',
      styleReferenceAttached: true,
      styleDensityMode: 'minimal',
    })

    expect(prompt).toContain('Layout density:')
    expect(prompt).toContain('refined minimal Amazon layout')
    expect(prompt).toContain('fewer callouts')
    expect(prompt).not.toContain('information-rich Amazon gallery layout')
  })

  it('builds MAIN prompts without series style guide or style reference guard when style is disabled', () => {
    const prompt = buildAmazonPlanPrompt({
      prompt: 'Amazon compliant MAIN image on a pure white background.',
      negativePrompt: 'text, props, non-white background',
      seriesStyleGuide: null,
      styleReferenceAttached: false,
    })

    expect(prompt).toContain('Amazon compliant MAIN image')
    expect(prompt).toContain('Negative prompt:')
    expect(prompt).toContain('text, props, non-white background')
    expect(prompt).not.toContain('Series style guide:')
    expect(prompt).not.toContain('Layout density:')
    expect(prompt).not.toContain('The last input image is a hidden style reference')
    expect(prompt).not.toContain('Selected visual style')
  })

  it('identifies the Amazon listing MAIN slot regardless of casing or spacing', () => {
    expect(isAmazonListingMainSlot('MAIN')).toBe(true)
    expect(isAmazonListingMainSlot(' main ')).toBe(true)
    expect(isAmazonListingMainSlot('PT01')).toBe(false)
    expect(isAmazonListingMainSlot(undefined)).toBe(false)
  })

  it('builds A+ prompts with the same LLM-led structure', () => {
    const prompt = buildAmazonAPlusPlanPrompt({
      prompt: 'Premium A+ banner with the product in a refined kitchen setting.',
      negativePrompt: 'pricing, reviews, clutter',
      seriesStyleGuide: 'Bright ceramic editorial style.',
      styleReferenceAttached: false,
    })

    expect(prompt).toContain('Premium A+ banner')
    expect(prompt).toContain('Bright ceramic editorial style')
    expect(prompt).toContain('pricing, reviews, clutter')
    expect(prompt).not.toContain('Layout density:')
    expect(prompt).not.toContain('The last input image is a hidden style reference')
  })

  it('applies selected visual style priority to A+ prompts', () => {
    const prompt = buildAmazonAPlusPlanPrompt({
      prompt: 'A+ module with feature callouts.',
      negativePrompt: 'pricing, reviews',
      seriesStyleGuide: 'Use warm tan backgrounds.',
      styleReferenceAttached: true,
      selectedVisualStyle: {
        label: '明亮零售',
        description: '明快色块、清晰卖点区域、购物页友好，适合快消、厨房、运动配件。',
        palette: ['#FFFFFF', '#F97316', '#2563EB'],
      },
    })

    expect(prompt).toContain('Style reference: 明亮零售.')
    expect(prompt).toContain('Palette anchors: #FFFFFF, #F97316, #2563EB.')
    expect(prompt).toContain('Series style guide (lower priority than the selected visual style):')
  })

})

describe('A+ module helpers', () => {
  it('returns local Chinese module names while preserving English labels', () => {
    const highlightSpec = getAPlusModuleSpecs('standard')[4]!
    const premiumSpec = getAPlusModuleSpecs('premium')[0]!

    expect(getAPlusModuleDisplayName(highlightSpec)).toBe('卖点方块 1')
    expect(getAPlusModuleEnglishName(highlightSpec)).toBe('Highlight Tile 1')
    expect(getAPlusModuleDisplayName(premiumSpec)).toBe('高级首屏横幅')
    expect(getAPlusModuleEnglishName(premiumSpec)).toBe('Hero Banner')
    expect(getAPlusContentTypeLabel('standard-large')).toBe('普通A+')
    expect(getAPlusContentTypeLabel('standard')).toBe('标准A+')
    expect(getAPlusContentTypeLabel('premium')).toBe('高级A+')
    expect(getAPlusContentTypeLabel('mobile')).toBe('手机A+')
  })

  it('defines Mobile A+ as five 600x450 modules', () => {
    const mobileSpecs = getAPlusModuleSpecs('mobile')

    expect(mobileSpecs).toHaveLength(5)
    expect(mobileSpecs.map((spec) => spec.slot)).toEqual(['A+M01', 'A+M02', 'A+M03', 'A+M04', 'A+M05'])
    expect(mobileSpecs.every((spec) => spec.uploadWidth === 600 && spec.uploadHeight === 450)).toBe(true)
    expect(getAPlusModuleDisplayName(mobileSpecs[0]!)).toBe('手机首屏')
    expect(getAPlusModuleEnglishName(mobileSpecs[1]!)).toBe('Mobile Feature 1')
  })

  it('adds and removes A+ modules inline while reindexing slots and labels', () => {
    const defaultSpecs = getAPlusModuleSpecs('standard-large')
    const addedSpecs = insertAPlusModuleSpecAfter('standard-large', defaultSpecs, 4)

    expect(addedSpecs).toHaveLength(6)
    expect(addedSpecs.map((spec) => spec.slot)).toEqual(['A+L01', 'A+L02', 'A+L03', 'A+L04', 'A+L05', 'A+L06'])
    expect(addedSpecs[5]).toMatchObject({
      label: 'Single Image 5',
      displayLabel: '大图模块 5',
      moduleType: 'single-image',
      uploadWidth: 970,
      uploadHeight: 600,
    })

    const removedSpecs = removeAPlusModuleSpecAt('standard-large', addedSpecs, 0)
    expect(removedSpecs.map((spec) => spec.slot)).toEqual(['A+L01', 'A+L02', 'A+L03', 'A+L04', 'A+L05'])
    expect(removedSpecs[0]).toMatchObject({
      label: 'Single Image 1',
      displayLabel: '大图模块 1',
      moduleType: 'single-image',
      uploadWidth: 970,
      uploadHeight: 600,
    })
  })

  it('keeps A+ module counts between 1 and 12', () => {
    let specs = getAPlusModuleSpecs('mobile')
    for (let index = 0; index < 20; index += 1) {
      specs = insertAPlusModuleSpecAfter('mobile', specs, specs.length - 1)
    }

    expect(specs).toHaveLength(MAX_A_PLUS_MODULE_COUNT)
    for (let index = 0; index < 20; index += 1) {
      specs = removeAPlusModuleSpecAt('mobile', specs, specs.length - 1)
    }
    expect(specs).toHaveLength(1)
    expect(specs[0]?.slot).toBe('A+M01')
  })

  it('formats external A+ module copy from the LLM', () => {
    expect(formatAPlusModuleText({
      textTitle: 'Organized in Seconds',
      textBody: 'Elastic loops keep pens, pencils, and small tools easy to find.',
    })).toBe('Organized in Seconds\n\nElastic loops keep pens, pencils, and small tools easy to find.')
  })
})

function createApiPlans(count = 7) {
  return [
    'MAIN',
    ...Array.from({ length: count - 1 }, (_, index) => `PT${String(index + 1).padStart(2, '0')}`),
  ].map((slot) => ({
    slot,
    label: `${slot} 方案`,
    planMarkdown: `## ${slot} 主图方案\n\n中文策划说明。`,
    prompt: `Create Amazon listing image ${slot} for the product.`,
    negativePrompt: `negative ${slot}`,
  }))
}

function createApiPayload(title = 'AI planned tumbler', count = 7) {
  return {
    product: {
      title,
      category: 'Kitchen / Drinkware',
      brand: '',
      color: 'matte black',
      material: 'stainless steel',
      audience: 'commuters',
      packageIncludes: '1 tumbler, 1 straw',
    },
    sellingPoints: ['Cold for 24 hours'],
    seriesStyleGuide: 'Use a cohesive warm commercial style across the set.',
    imagePlans: createApiPlans(count),
  }
}

function createAPlusPlans(prefix: 'A+S' | 'A+L' | 'A+P' | 'A+M', brand = '') {
  const slots = prefix === 'A+S'
    ? ['A+S01', 'A+S02', 'A+S03', 'A+S04', 'A+S05', 'A+S06', 'A+S07', 'A+S08']
    : prefix === 'A+L'
      ? ['A+L01', 'A+L02', 'A+L03', 'A+L04', 'A+L05']
      : prefix === 'A+P'
        ? ['A+P01', 'A+P02', 'A+P03', 'A+P04', 'A+P05', 'A+P06']
        : ['A+M01', 'A+M02', 'A+M03', 'A+M04', 'A+M05']

  return slots.map((slot, index) => ({
    slot,
    label: `${slot} 模块`,
    moduleType: prefix === 'A+S'
      ? index === 0 ? 'header-banner' : index < 4 ? 'single-image' : 'highlight-tile'
      : prefix === 'A+L'
        ? index === 0 ? 'header-banner' : 'single-image'
        : prefix === 'A+P'
          ? index === 0 ? 'hero-banner' : index < 4 ? 'feature-image' : 'brand-story'
          : index === 0 ? 'hero-banner' : 'feature-image',
    planMarkdown: `## ${slot} 模块方案\n\n中文 A+ 策划说明。`,
    textTitle: prefix === 'A+S' && index >= 4 ? `Benefit ${slot}` : '',
    textBody: prefix === 'A+S' && index >= 4 ? `External A+ copy for ${slot}.` : '',
    prompt: brand && index === 0
      ? `Create A+ module ${slot} for ${brand}, using the brand name as a small headline line.`
      : `Create A+ module ${slot} for the product.`,
    negativePrompt: `negative ${slot}`,
  }))
}

function createAPlusPlansFromSpecs(specs: ReturnType<typeof getAPlusModuleSpecs>, brand = '') {
  return specs.map((spec, index) => ({
    slot: spec.slot,
    label: `${spec.slot} 模块`,
    moduleType: spec.moduleType,
    planMarkdown: `## ${spec.slot} 模块方案\n\n中文 A+ 策划说明。`,
    textTitle: spec.moduleType === 'highlight-tile' ? `Benefit ${spec.slot}` : '',
    textBody: spec.moduleType === 'highlight-tile' ? `External A+ copy for ${spec.slot}.` : '',
    prompt: brand && index === 0
      ? `Create A+ module ${spec.slot} for ${brand}, using the brand name as a small headline line.`
      : `Create A+ module ${spec.slot} for the product.`,
    negativePrompt: `negative ${spec.slot}`,
  }))
}

function createAPlusPayload(prefix: 'A+S' | 'A+L' | 'A+P' | 'A+M', title = 'AI planned A+ tumbler', brand = '') {
  return {
    product: {
      title,
      category: 'Kitchen / Drinkware',
      brand,
      color: 'matte black',
      material: 'stainless steel',
      audience: 'commuters',
      packageIncludes: '1 tumbler, 1 straw',
    },
    sellingPoints: ['Cold for 24 hours'],
    seriesStyleGuide: 'Use a cohesive A+ visual style across the module set.',
    aPlusPlans: createAPlusPlans(prefix, brand),
  }
}

function createAPlusPayloadFromSpecs(specs: ReturnType<typeof getAPlusModuleSpecs>, title = 'AI planned A+ tumbler', brand = '') {
  return {
    product: {
      title,
      category: 'Kitchen / Drinkware',
      brand,
      color: 'matte black',
      material: 'stainless steel',
      audience: 'commuters',
      packageIncludes: '1 tumbler, 1 straw',
    },
    sellingPoints: ['Cold for 24 hours'],
    seriesStyleGuide: 'Use a cohesive A+ visual style across the module set.',
    aPlusPlans: createAPlusPlansFromSpecs(specs, brand),
  }
}

describe('callAmazonPlannerApi', () => {
  it('uses Responses API planning with JSON schema and attached reference images', async () => {
    const apiPayload = createApiPayload()
    const controller = new AbortController()
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(apiPayload),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
      referenceImageDataUrls: ['data:image/png;base64,ref'],
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'user-api-key',
        apiMode: 'responses',
        model: 'gpt-planner-profile',
      }),
      signal: controller.signal,
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.example.com/v1/responses')
    expect(init?.signal).toBe(controller.signal)
    const body = JSON.parse(String(init?.body))
    expect(body.instructions).toContain('The application only fixes the slot count and order')
    expect(body.instructions).toContain('Amazon Listing reference material for the planner')
    expect(body.instructions).toContain('Use product reference images only to identify product facts')
    expect(body.instructions).toContain('must avoid fixed non-product aesthetics')
    expect(body.instructions).toContain('must not lock the final palette')
    expect(body.instructions).toContain('pure white background RGB 255,255,255')
    expect(body.instructions).toContain('product fills about 85%')
    expect(body.instructions).toContain('no text, logo, watermark')
    expect(body.instructions).toContain('Do not use Amazon, Prime, Alexa, Amazon Choice')
    expect(body.instructions).toContain('built-in preset style reference boards')
    expect(body.instructions).not.toContain('visual style reference board generation')
    expect(body.instructions).toContain('fully plan the finished Amazon image')
    expect(body.instructions).toContain('complete information design')
    expect(body.instructions).not.toContain('Because DeepSeek cannot receive or understand reference images')
    expect(body.instructions).not.toContain('sparse copy')
    expect(body.instructions).not.toContain('leave enough whitespace')
    expect(body.instructions).not.toContain('Embedded Amazon Listing knowledge rules')
    expect(body.instructions).not.toContain('mandatory phrase')
    expect(body.text.format.type).toBe('json_schema')
    expect(body.text.format.schema.required).toContain('seriesStyleGuide')
    expect(body.text.format.schema.required).not.toContain('styleCandidates')
    expect(body.text.format.schema.required).not.toContain('visualSystem')
    expect(body.text.format.schema.properties.product.properties).toHaveProperty('brand')
    expect(body.text.format.schema.properties.imagePlans.minItems).toBe(7)
    expect(body.text.format.schema.properties.imagePlans.maxItems).toBe(7)
    expect(body.text.format.schema.properties.imagePlans.items.properties.slot.enum).toEqual(['MAIN', 'PT01', 'PT02', 'PT03', 'PT04', 'PT05', 'PT06'])
    expect(body.text.format.schema.properties.imagePlans.items.properties).toHaveProperty('planMarkdown')
    expect(body.text.format.schema.properties.imagePlans.items.properties).toHaveProperty('negativePrompt')
    expect(body.input[0].content[0].text).toContain('Parse this Amazon listing copy')
    expect(body.input[0].content[1]).toEqual({ type: 'input_image', image_url: 'data:image/png;base64,ref' })
    expect(result.parsed.title).toBe('AI planned tumbler')
    expect(result.seriesStyleGuide).toContain('cohesive warm')
    expect(result.plans[0]).toMatchObject({
      slot: 'MAIN',
      planMarkdown: expect.stringContaining('MAIN 主图方案'),
      negativePrompt: 'negative MAIN',
    })
  })

  it('uses the requested Listing image count in Responses schema, instructions, input, and result validation', async () => {
    const apiPayload = createApiPayload('10 image tumbler', 10)
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(apiPayload),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'user-api-key',
        apiMode: 'responses',
        model: 'gpt-planner-profile',
      }),
      listingImageCount: 10,
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    const slots = ['MAIN', 'PT01', 'PT02', 'PT03', 'PT04', 'PT05', 'PT06', 'PT07', 'PT08', 'PT09']
    expect(body.text.format.schema.properties.imagePlans.minItems).toBe(10)
    expect(body.text.format.schema.properties.imagePlans.maxItems).toBe(10)
    expect(body.text.format.schema.properties.imagePlans.items.properties.slot.enum).toEqual(slots)
    expect(body.instructions).toContain(`exactly 10 Amazon listing image slots: ${slots.join(', ')}`)
    expect(body.input[0].content[0].text).toContain('produce the 10-image visual plan')
    expect(result.plans).toHaveLength(10)
    expect(result.plans.map((plan) => plan.slot)).toEqual(slots)
  })

  it('uses Chat Completions planning with multimodal user content when references are present', async () => {
    const apiPayload = createApiPayload('Chat planned tumbler')
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify(apiPayload),
          },
          finish_reason: 'stop',
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
      referenceImageDataUrls: ['data:image/png;base64,ref-chat'],
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com',
        apiKey: 'chat-key',
        apiMode: 'chat',
        model: DEFAULT_CHAT_MODEL,
      }),
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.example.com/chat/completions')
    const body = JSON.parse(String(init?.body))
    expect(body.messages[0].content).toContain('Return a valid JSON object only')
    expect(body.messages[0].content).not.toContain('styleCandidates')
    expect(body.messages[0].content).not.toContain('Because DeepSeek cannot receive or understand reference images')
    expect(body.messages[0].content).toContain('Amazon Listing reference material for the planner')
    expect(body.messages[0].content).toContain('Use product reference images only to identify product facts')
    expect(body.messages[0].content).toContain('must avoid fixed non-product aesthetics')
    expect(body.messages[0].content).toContain('built-in preset style reference boards')
    expect(body.messages[1].content[0]).toMatchObject({ type: 'text' })
    expect(body.messages[1].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,ref-chat' },
    })
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(result.parsed.title).toBe('Chat planned tumbler')
    expect(result.plans).toHaveLength(7)
  })

  it('uses the requested Listing image count in Chat Completions schema guidance', async () => {
    const apiPayload = createApiPayload('Chat 10 image tumbler', 10)
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify(apiPayload),
          },
          finish_reason: 'stop',
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com',
        apiKey: 'chat-key',
        apiMode: 'chat',
        model: DEFAULT_CHAT_MODEL,
      }),
      listingImageCount: 10,
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.messages[0].content).toContain('imagePlans must contain exactly 10 items in this order: MAIN, PT01, PT02, PT03, PT04, PT05, PT06, PT07, PT08, PT09.')
    expect(body.messages[1].content).toContain('produce the 10-image visual plan')
    expect(result.plans).toHaveLength(10)
  })

  it('omits reference images for DeepSeek Chat Completions planning', async () => {
    const apiPayload = createApiPayload('DeepSeek planned tumbler')
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify(apiPayload),
          },
          finish_reason: 'stop',
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: {
        ...DEFAULT_AMAZON_PROMPT_DRAFT,
        color: 'matte black',
        packageIncludes: '1 tumbler, 1 straw',
      },
      referenceImageDataUrls: ['data:image/png;base64,ref-chat'],
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'deepseek-key',
        apiMode: 'chat',
        model: DEFAULT_CHAT_MODEL,
      }),
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    const body = JSON.parse(String(init?.body))
    expect(body.messages[0].content).toContain('Because DeepSeek cannot receive or understand reference images')
    expect(body.messages[0].content).toContain('Do not invent colors, shapes, structures, accessories, logos, bundle quantity')
    expect(typeof body.messages[1].content).toBe('string')
    expect(body.messages[1].content).toContain('Parse this Amazon listing copy')
    expect(body.messages[1].content).toContain('User-provided product facts')
    expect(body.messages[1].content).toContain('- Color: matte black')
    expect(body.messages[1].content).toContain('- Package includes: 1 tumbler, 1 straw')
    expect(body.messages[1].content).not.toContain('If reference images are attached')
    expect(JSON.stringify(body.messages)).not.toContain('image_url')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(result.parsed.title).toBe('DeepSeek planned tumbler')
    expect(result.plans).toHaveLength(7)
  })

  it('omits reference images for DeepSeek Responses API planning', async () => {
    const apiPayload = createApiPayload('DeepSeek responses planned tumbler')
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(apiPayload),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: {
        ...DEFAULT_AMAZON_PROMPT_DRAFT,
        brand: 'ExampleBrand',
        material: '18/8 stainless steel',
      },
      referenceImageDataUrls: ['data:image/png;base64,ref-responses'],
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'deepseek-key',
        apiMode: 'responses',
        model: 'deepseek-v4-pro',
      }),
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.deepseek.com/v1/responses')
    const body = JSON.parse(String(init?.body))
    expect(body.instructions).toContain('Because DeepSeek cannot receive or understand reference images')
    expect(body.instructions).toContain('Do not invent colors, shapes, structures, accessories, logos, bundle quantity')
    expect(body.input[0].content).toHaveLength(1)
    expect(body.input[0].content[0].type).toBe('input_text')
    expect(body.input[0].content[0].text).toContain('User-provided product facts')
    expect(body.input[0].content[0].text).toContain('- Brand or model: ExampleBrand')
    expect(body.input[0].content[0].text).toContain('- Material / finish: 18/8 stainless steel')
    expect(body.input[0].content[0].text).not.toContain('If reference images are attached')
    expect(JSON.stringify(body.input)).not.toContain('input_image')
    expect(result.parsed.title).toBe('DeepSeek responses planned tumbler')
    expect(result.plans).toHaveLength(7)
  })

  it('parses Standard A+ output and fills fixed module sizes without deciding content locally', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(createAPlusPayload('A+S', 'Standard A+ tumbler', 'ExampleBrand')),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: { ...DEFAULT_AMAZON_PROMPT_DRAFT, brand: 'ExampleBrand' },
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'user-api-key',
        apiMode: 'responses',
        model: 'gpt-planner-profile',
      }),
      mode: 'aplus',
      aPlusType: 'standard',
      aPlusGenerationTier: '2K',
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.text.format.name).toBe('amazon_aplus_image_plan')
    expect(body.text.format.schema.properties.product.properties).toHaveProperty('brand')
    expect(body.text.format.schema.properties.product.required).toContain('brand')
    expect(body.text.format.schema.properties.aPlusPlans.items.properties).toHaveProperty('planMarkdown')
    expect(body.text.format.schema.properties.aPlusPlans.items.properties).toHaveProperty('negativePrompt')
    expect(body.text.format.schema.required).toContain('seriesStyleGuide')
    expect(body.text.format.schema.required).not.toContain('visualSystem')
    expect(body.instructions).toContain('The application only fixes the module order, module type, upload size, and generation size')
    expect(body.instructions).toContain('Amazon A+ reference material for the planner')
    expect(body.instructions).toContain('Use product reference images only to identify product facts')
    expect(body.instructions).toContain('must avoid fixed non-product aesthetics')
    expect(body.instructions).toContain('Header Banner 970x300')
    expect(body.instructions).toContain('Single Image 970x600')
    expect(body.instructions).toContain('Highlight Tile 220x220')
    expect(body.instructions).toContain('Comparison Thumbnail 150x300')
    expect(body.instructions).toContain('QR codes')
    expect(body.instructions).toContain('mobile-readable')
    expect(body.instructions).toContain('built-in preset style reference boards')
    expect(body.instructions).not.toContain('visual style reference board generation')
    expect(body.instructions).toContain('fully plan the finished Amazon image')
    expect(body.instructions).toContain('complete information design')
    expect(body.instructions).toContain('Known brand/model: ExampleBrand')
    expect(body.instructions).toContain('small brand line, headline prefix, or subline')
    expect(body.instructions).toContain('Do not invent logo artwork')
    expect(body.instructions).not.toContain('sparse copy')
    expect(body.instructions).not.toContain('leave enough whitespace')
    expect(body.instructions).not.toContain('A+ compliance:')
    expect(result.mode).toBe('aplus')
    expect(result.parsed.inferred.brand).toBe('ExampleBrand')
    expect(result.aPlusPlans).toHaveLength(8)
    expect(result.aPlusPlans[0]).toMatchObject({
      slot: 'A+S01',
      moduleType: 'header-banner',
      uploadSize: '970x300',
      planMarkdown: expect.stringContaining('A+S01 模块方案'),
      prompt: expect.stringContaining('ExampleBrand'),
    })
    expect(result.aPlusPlans[4]).toMatchObject({
      slot: 'A+S05',
      moduleType: 'highlight-tile',
      uploadSize: '220x220',
      textTitle: 'Benefit A+S05',
      textBody: 'External A+ copy for A+S05.',
    })
  })

  it('uses custom A+ module specs in schema, prompts, chat guide, and result validation', async () => {
    const customSpecs = insertAPlusModuleSpecAfter('standard-large', getAPlusModuleSpecs('standard-large'), 4)
    const customPayload = createAPlusPayloadFromSpecs(customSpecs, 'Custom A+ tumbler', 'ExampleBrand')
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(customPayload),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const responseResult = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: { ...DEFAULT_AMAZON_PROMPT_DRAFT, brand: 'ExampleBrand' },
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'user-api-key',
        apiMode: 'responses',
        model: 'gpt-planner-profile',
      }),
      mode: 'aplus',
      aPlusType: 'standard-large',
      aPlusModuleSpecs: customSpecs,
      aPlusGenerationTier: '2K',
    })

    const responseBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(responseBody.text.format.schema.properties.aPlusPlans.minItems).toBe(6)
    expect(responseBody.text.format.schema.properties.aPlusPlans.maxItems).toBe(6)
    expect(responseBody.text.format.schema.properties.aPlusPlans.items.properties.slot.enum).toEqual(['A+L01', 'A+L02', 'A+L03', 'A+L04', 'A+L05', 'A+L06'])
    expect(responseBody.instructions).toContain('Return exactly 6 modules')
    expect(responseBody.instructions).toContain('A+L06 Single Image 5 970x600px')
    expect(responseBody.input[0].content[0].text).toContain('Use these A+ modules exactly: A+L01, A+L02, A+L03, A+L04, A+L05, A+L06.')
    expect(responseResult.aPlusPlans).toHaveLength(6)
    expect(responseResult.aPlusPlans[5]).toMatchObject({
      slot: 'A+L06',
      label: 'Single Image 5',
      moduleType: 'single-image',
      uploadSize: '970x600',
      planMarkdown: expect.stringContaining('A+L06 模块方案'),
    })

    fetchMock.mockClear()
    const chatResult = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: { ...DEFAULT_AMAZON_PROMPT_DRAFT, brand: 'ExampleBrand' },
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'user-api-key',
        apiMode: 'chat',
        model: 'gpt-planner-profile',
      }),
      mode: 'aplus',
      aPlusType: 'standard-large',
      aPlusModuleSpecs: customSpecs,
      aPlusGenerationTier: '2K',
    })

    const chatBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(chatBody.messages[0].content).toContain('Return exactly 6 modules')
    expect(chatBody.messages[0].content).toContain('aPlusPlans must contain exactly 6 items in this order: A+L01, A+L02, A+L03, A+L04, A+L05, A+L06.')
    expect(chatBody.messages[1].content).toContain('Use these A+ modules exactly: A+L01, A+L02, A+L03, A+L04, A+L05, A+L06.')
    expect(chatResult.aPlusPlans).toHaveLength(6)
  })

  it('parses Mobile A+ output as five fixed 600x450 modules', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(createAPlusPayload('A+M', 'Mobile A+ tumbler', 'ExampleBrand')),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: { ...DEFAULT_AMAZON_PROMPT_DRAFT, brand: 'ExampleBrand' },
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'user-api-key',
        apiMode: 'responses',
        model: 'gpt-planner-profile',
      }),
      mode: 'aplus',
      aPlusType: 'mobile',
      aPlusGenerationTier: '2K',
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.text.format.schema.properties.aPlusPlans.minItems).toBe(5)
    expect(body.text.format.schema.properties.aPlusPlans.maxItems).toBe(5)
    expect(body.text.format.schema.properties.aPlusPlans.items.properties.slot.enum).toEqual(['A+M01', 'A+M02', 'A+M03', 'A+M04', 'A+M05'])
    expect(body.text.format.schema.properties.aPlusPlans.items.properties.moduleType.enum).toEqual(['hero-banner', 'feature-image'])
    expect(body.instructions).toContain('Mobile A+ Content 600x450 module set')
    expect(body.instructions).toContain('A+M01 Mobile Hero 600x450px')
    expect(body.instructions).toContain('A+M05 Mobile Feature 4 600x450px')
    expect(body.instructions).toContain('five compact 600x450 modules')
    expect(body.instructions).toContain('compact mobile screens')
    expect(body.input[0].content[0].text).toContain('手机A+ module plan')
    expect(body.input[0].content[0].text).toContain('Use these A+ modules exactly: A+M01, A+M02, A+M03, A+M04, A+M05.')
    expect(result.mode).toBe('aplus')
    expect(result.aPlusType).toBe('mobile')
    expect(result.aPlusPlans).toHaveLength(5)
    expect(result.aPlusPlans[0]).toMatchObject({
      slot: 'A+M01',
      moduleType: 'hero-banner',
      uploadSize: '600x450',
      planMarkdown: expect.stringContaining('A+M01 模块方案'),
      prompt: expect.stringContaining('ExampleBrand'),
    })
    expect(result.aPlusPlans[4]).toMatchObject({
      slot: 'A+M05',
      moduleType: 'feature-image',
      uploadSize: '600x450',
    })
    expect(result.aPlusPlans[0]?.generationSize).not.toBe('600x450')
  })

  it('does not include empty A+ brand output in parsed inferred fields', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(createAPlusPayload('A+S', 'Standard A+ tumbler')),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: { ...DEFAULT_AMAZON_PROMPT_DRAFT, brand: 'ExistingBrand' },
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'user-api-key',
        apiMode: 'responses',
        model: 'gpt-planner-profile',
      }),
      mode: 'aplus',
      aPlusType: 'standard',
      aPlusGenerationTier: '2K',
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.instructions).toContain('Known brand/model: ExistingBrand')
    expect(result.parsed.inferred).not.toHaveProperty('brand')
  })
})
