import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultOpenAIProfile } from './apiProfiles'
import { DEFAULT_AMAZON_PROMPT_DRAFT } from './amazonPrompt'
import {
  buildAmazonAPlusPlanPrompt,
  buildAmazonPlanPrompt,
  formatAPlusModuleText,
  getAPlusContentTypeLabel,
  getAPlusModuleDisplayName,
  getAPlusModuleEnglishName,
  getAPlusModuleSpecs,
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

describe('buildAmazonPlanPrompt', () => {
  it('adds secondary image copy to the generation prompt', () => {
    const prompt = buildAmazonPlanPrompt({
      kind: 'lifestyle',
      copy: 'Large Coverage for 2-3 People\\n49 / 54 / 62 in Options',
      prompt: 'Create a lifestyle Amazon image.',
    })

    expect(prompt).toContain('Create a lifestyle Amazon image.')
    expect(prompt).toContain('On-image copy to render exactly:')
    expect(prompt).toContain('"Large Coverage for 2-3 People\n49 / 54 / 62 in Options"')
    expect(prompt).toContain('Do not add any other text')
  })

  it('keeps main image prompts text-free even when copy is present', () => {
    const prompt = buildAmazonPlanPrompt({
      kind: 'main',
      copy: 'Do not render this',
      prompt: 'Create a pure white Amazon main image.',
    })

    expect(prompt).toBe('Create a pure white Amazon main image.')
  })

  it('does not duplicate an existing copy instruction', () => {
    const original = [
      'Create a detail image.',
      '',
      'On-image copy to render exactly:',
      '"Existing Copy"',
    ].join('\n')

    expect(buildAmazonPlanPrompt({
      kind: 'detail',
      copy: 'Existing Copy',
      prompt: original,
    })).toBe(original)
  })
})

describe('buildAmazonAPlusPlanPrompt', () => {
  it('adds A+ module size, copy, and compliance instructions to the generation prompt', () => {
    const prompt = buildAmazonAPlusPlanPrompt({
      moduleType: 'header-banner',
      uploadSize: '970x300',
      generationSize: '3544x1184',
      copy: 'Built for Rainy Commutes\\nCompact Coverage',
      prompt: 'Create a premium umbrella A+ banner.',
    })

    expect(prompt).toContain('Create a premium umbrella A+ banner.')
    expect(prompt).toContain('A+ module requirements:')
    expect(prompt).toContain('Final Seller Central recommended upload size: 970x300px')
    expect(prompt).toContain('Generate at 3544x1184px')
    expect(prompt).toContain('On-image copy to render exactly:')
    expect(prompt).toContain('Built for Rainy Commutes\nCompact Coverage')
    expect(prompt).toContain('Do not include prices')
  })

  it('keeps external A+ text out of the image generation prompt', () => {
    const plan = {
      moduleType: 'highlight-tile' as const,
      uploadSize: '220x220',
      generationSize: '2048x2048',
      copy: '',
      textTitle: 'Built for Daily Commutes',
      textBody: 'Soft padding protects essentials while the zipper keeps supplies secure.',
      prompt: 'Create a clean 220x220 product highlight tile.',
    }

    const prompt = buildAmazonAPlusPlanPrompt(plan)

    expect(prompt).toContain('Create a clean 220x220 product highlight tile.')
    expect(prompt).not.toContain(plan.textTitle)
    expect(prompt).not.toContain(plan.textBody)
    expect(prompt).toContain('Do not add on-image text')
  })
})

describe('A+ module labels and text', () => {
  it('returns local Chinese module names while preserving English labels', () => {
    const highlightSpec = getAPlusModuleSpecs('standard')[4]!
    const premiumSpec = getAPlusModuleSpecs('premium')[0]!

    expect(getAPlusModuleDisplayName(highlightSpec)).toBe('卖点方块 1')
    expect(getAPlusModuleEnglishName(highlightSpec)).toBe('Highlight Tile 1')
    expect(getAPlusModuleDisplayName(premiumSpec)).toBe('高级首屏横幅')
    expect(getAPlusModuleEnglishName(premiumSpec)).toBe('Hero Banner')
    expect(getAPlusContentTypeLabel('standard-large')).toBe('大图版')
  })

  it('formats external A+ module copy without mixing it with on-image copy', () => {
    expect(formatAPlusModuleText({
      textTitle: 'Organized in Seconds',
      textBody: 'Elastic loops keep pens, pencils, and small tools easy to find.',
    })).toBe('Organized in Seconds\n\nElastic loops keep pens, pencils, and small tools easy to find.')
  })
})

function createApiPlans() {
  return ['MAIN', 'PT01', 'PT02', 'PT03', 'PT04', 'PT05', 'PT06'].map((slot, index) => ({
    slot,
    label: index === 0 ? '主图' : `附图 ${index}`,
    kind: index === 0 ? 'main' : 'lifestyle',
    objective: `Objective ${slot}`,
    concept: `Concept ${slot}`,
    copy: index === 0 ? '' : `Copy ${slot}`,
    compliance: `Compliance ${slot}`,
    scene: `Scene ${slot}`,
    prompt: `Create Amazon listing image ${slot} for the product.`,
  }))
}

function createApiPayload(title = 'AI planned tumbler') {
  return {
    product: {
      title,
      category: 'Kitchen / Drinkware',
      color: 'matte black',
      material: 'stainless steel',
      audience: 'commuters',
      packageIncludes: '1 tumbler, 1 straw',
    },
    sellingPoints: ['Cold for 24 hours'],
    imagePlans: createApiPlans(),
  }
}

function createAPlusPlans(prefix: 'A+S' | 'A+L' | 'A+P') {
  const slots = prefix === 'A+S'
    ? ['A+S01', 'A+S02', 'A+S03', 'A+S04', 'A+S05', 'A+S06', 'A+S07', 'A+S08']
    : prefix === 'A+L'
      ? ['A+L01', 'A+L02', 'A+L03', 'A+L04', 'A+L05']
      : ['A+P01', 'A+P02', 'A+P03', 'A+P04', 'A+P05', 'A+P06']

  return slots.map((slot, index) => ({
    slot,
    label: `${slot} 模块`,
    moduleType: prefix === 'A+S'
      ? index === 0 ? 'header-banner' : index < 4 ? 'single-image' : 'highlight-tile'
      : prefix === 'A+L'
        ? index === 0 ? 'header-banner' : 'single-image'
        : index === 0 ? 'hero-banner' : index < 4 ? 'feature-image' : 'brand-story',
    objective: `Objective ${slot}`,
    concept: `Concept ${slot}`,
    copy: `Copy ${slot}`,
    textTitle: prefix === 'A+S' && index >= 4 ? `Benefit ${slot}` : '',
    textBody: prefix === 'A+S' && index >= 4 ? `External A+ copy for ${slot}.` : '',
    compliance: `Compliance ${slot}`,
    scene: `Scene ${slot}`,
    prompt: `Create A+ module ${slot} for the product.`,
  }))
}

function createAPlusPayload(prefix: 'A+S' | 'A+L' | 'A+P', title = 'AI planned A+ tumbler') {
  return {
    product: {
      title,
      category: 'Kitchen / Drinkware',
      color: 'matte black',
      material: 'stainless steel',
      audience: 'commuters',
      packageIncludes: '1 tumbler, 1 straw',
    },
    sellingPoints: ['Cold for 24 hours'],
    aPlusPlans: createAPlusPlans(prefix),
  }
}

function createSseResponse(events: Array<Record<string, unknown>>, contentType = 'text/event-stream') {
  const body = [
    ...events.map((event) => [
      `event: ${typeof event.type === 'string' ? event.type : 'message'}`,
      `data: ${JSON.stringify(event)}`,
      '',
    ].join('\n')),
    'data: [DONE]\n',
  ].join('\n')

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType },
  })
}

describe('callAmazonPlannerApi', () => {
  it('uses the active API profile URL and key for Responses API planning', async () => {
    const apiPayload = createApiPayload()
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(apiPayload),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const profile = createDefaultOpenAIProfile({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'user-api-key',
      apiMode: 'responses',
      model: 'gpt-planner-profile',
    })
    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
      profile,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.example.com/v1/responses')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer user-api-key',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(String(init?.body))
    expect(body.model).toBe('gpt-planner-profile')
    expect(body.text.format.type).toBe('json_schema')
    expect(body.stream).toBe(false)
    expect(body.input[0].content[0].text).toContain('Parse this Amazon listing copy')
    expect(result.parsed.title).toBe('AI planned tumbler')
    expect(result.plans).toHaveLength(7)
    expect(result.aPlusPlans).toHaveLength(0)
  })

  it('parses Standard A+ planning output and fills fixed module sizes', async () => {
    const apiPayload = createAPlusPayload('A+S', 'Standard A+ tumbler')
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
      mode: 'aplus',
      aPlusType: 'standard',
      aPlusGenerationTier: '2K',
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.text.format.name).toBe('amazon_aplus_image_plan')
    expect(body.text.format.schema.properties.aPlusPlans.items.properties).toHaveProperty('textTitle')
    expect(body.text.format.schema.properties.aPlusPlans.items.properties).toHaveProperty('textBody')
    expect(body.text.format.schema.properties.aPlusPlans.items.required).toContain('textTitle')
    expect(body.text.format.schema.properties.aPlusPlans.items.required).toContain('textBody')
    expect(body.input[0].content[0].text).toContain('Standard A+ Content')
    expect(result.mode).toBe('aplus')
    expect(result.parsed.title).toBe('Standard A+ tumbler')
    expect(result.plans).toHaveLength(0)
    expect(result.aPlusPlans).toHaveLength(8)
    expect(result.aPlusPlans[0]).toMatchObject({
      slot: 'A+S01',
      moduleType: 'header-banner',
      uploadSize: '970x300',
    })
    expect(result.aPlusPlans[0]?.generationSize).toMatch(/^\d+x\d+$/)
    expect(result.aPlusPlans[0]?.generationSize).not.toBe('970x300')
    expect(result.aPlusPlans[4]).toMatchObject({
      slot: 'A+S05',
      moduleType: 'highlight-tile',
      uploadSize: '220x220',
      textTitle: 'Benefit A+S05',
      textBody: 'External A+ copy for A+S05.',
    })
    expect(formatAPlusModuleText(result.aPlusPlans[4]!)).toBe('Benefit A+S05\n\nExternal A+ copy for A+S05.')
  })

  it('parses large-image A+ template output as one banner plus four big images', async () => {
    const apiPayload = createAPlusPayload('A+L', 'Large image A+ tumbler')
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
      mode: 'aplus',
      aPlusType: 'standard-large',
      aPlusGenerationTier: '2K',
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.input[0].content[0].text).toContain('大图版 A+ Content')
    expect(body.instructions).toContain('one 970x300 header banner and four 970x600 single-image modules')
    expect(result.mode).toBe('aplus')
    expect(result.aPlusType).toBe('standard-large')
    expect(result.aPlusPlans).toHaveLength(5)
    expect(result.aPlusPlans[0]).toMatchObject({
      slot: 'A+L01',
      moduleType: 'header-banner',
      uploadSize: '970x300',
    })
    expect(result.aPlusPlans.slice(1).every((plan) => plan.moduleType === 'single-image')).toBe(true)
    expect(result.aPlusPlans[4]).toMatchObject({
      slot: 'A+L05',
      moduleType: 'single-image',
      uploadSize: '970x600',
    })
  })

  it('parses Premium A+ planning output and fills fixed module sizes', async () => {
    const apiPayload = createAPlusPayload('A+P', 'Premium A+ tumbler')
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
      mode: 'aplus',
      aPlusType: 'premium',
      aPlusGenerationTier: '4K',
    })

    expect(result.mode).toBe('aplus')
    expect(result.aPlusType).toBe('premium')
    expect(result.aPlusPlans).toHaveLength(6)
    expect(result.aPlusPlans[0]).toMatchObject({
      slot: 'A+P01',
      moduleType: 'hero-banner',
      uploadSize: '1464x600',
    })
    expect(result.aPlusPlans[4]).toMatchObject({
      slot: 'A+P05',
      moduleType: 'brand-story',
      uploadSize: '463x625',
    })
  })

  it('parses event-stream Responses API planning output from response.completed', async () => {
    const apiPayload = createApiPayload('SSE completed tumbler')
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => createSseResponse([
      {
        type: 'response.completed',
        response: {
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: JSON.stringify(apiPayload) }],
            },
          ],
        },
      },
    ]))
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
    })

    expect(result.parsed.title).toBe('SSE completed tumbler')
    expect(result.plans).toHaveLength(7)
  })

  it('parses event-stream Responses API planning output from output text events', async () => {
    const apiPayload = createApiPayload('SSE delta tumbler')
    const text = JSON.stringify(apiPayload)
    const midpoint = Math.floor(text.length / 2)
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => createSseResponse([
      { type: 'response.output_text.delta', delta: text.slice(0, midpoint) },
      { type: 'response.output_text.delta', delta: text.slice(midpoint) },
      { type: 'response.output_text.done', text },
    ]))
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
    })

    expect(result.parsed.title).toBe('SSE delta tumbler')
    expect(result.plans).toHaveLength(7)
  })

  it('parses event-stream planning output even when a compatible provider reports a JSON content type', async () => {
    const apiPayload = createApiPayload('SSE mislabeled tumbler')
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => createSseResponse([
      {
        type: 'response.output_item.done',
        item: {
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify(apiPayload) }],
        },
      },
    ], 'application/json'))
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
    })

    expect(result.parsed.title).toBe('SSE mislabeled tumbler')
    expect(result.plans).toHaveLength(7)
  })

  it('preserves stream failure messages on planner failures', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => createSseResponse([
      {
        type: 'response.failed',
        error: { message: 'Structured output is unavailable on this gateway.' },
      },
    ]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'user-api-key',
        apiMode: 'responses',
        model: 'gpt-planner-profile',
      }),
    })).rejects.toThrow('Structured output is unavailable on this gateway.')
  })

  it('preserves HTTP status and API message on planner failures', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      error: { message: 'The requested endpoint /v1/responses is not available.' },
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'user-api-key',
        apiMode: 'responses',
        model: 'gpt-planner-profile',
      }),
    })).rejects.toThrow('HTTP 404: The requested endpoint /v1/responses is not available.')
  })
})
