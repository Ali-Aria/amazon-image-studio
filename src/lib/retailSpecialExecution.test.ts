import { describe, expect, it } from 'vitest'
import type { InputImage, RetailImagePlan, RetailProjectSlot, RetailSourceImageRole } from '../types'
import { getRetailGenerationTargets, selectRetailPlanInputs } from './retailSpecialExecution'

function plan(overrides: Partial<RetailImagePlan> = {}): RetailImagePlan {
  return {
    id: '08-special',
    order: 8,
    label: '平台特殊图',
    objective: '特殊图',
    prompt: '',
    negativePrompt: '',
    composeMode: 'special',
    copyLines: [],
    targetSize: { width: 600, height: 600 },
    generationSize: '1024x1024',
    generationEligible: true,
    processingMode: 'deterministic',
    specialImageType: 'product_facts',
    requiredSourceRole: 'product',
    ...overrides,
  }
}

const images: InputImage[] = [
  { id: 'product-a', dataUrl: 'data:image/png;base64,PRODUCT' },
  { id: 'gift-a', dataUrl: 'data:image/png;base64,GIFT' },
  { id: 'label-a', dataUrl: 'data:image/png;base64,LABEL' },
  { id: 'document-a', dataUrl: 'data:image/png;base64,DOCUMENT' },
]

const roles: Record<string, RetailSourceImageRole> = {
  'product-a': 'product',
  'gift-a': 'gift_pack',
  'label-a': 'back_label',
  'document-a': 'authentic_document',
}

describe('special image execution routing', () => {
  it('bypasses the image model for deterministic and source-only plans', () => {
    const deterministic = selectRetailPlanInputs(plan(), images, roles)
    const sourceOnly = selectRetailPlanInputs(plan({
      processingMode: 'source-only',
      specialImageType: 'authentic_document',
      requiredSourceRole: 'authentic_document',
    }), images, roles)

    expect(deterministic).toMatchObject({ useModel: false, images: [images[0]] })
    expect(sourceOnly).toMatchObject({ useModel: false, images: [images[3]] })
  })

  it('sends only product and real gift-package references to gift generation', () => {
    const selected = selectRetailPlanInputs(plan({
      processingMode: 'ai-preserve',
      specialImageType: 'gift_pack',
      requiredSourceRole: 'gift_pack',
      prompt: 'preserve both references',
    }), images, roles)

    expect(selected.useModel).toBe(true)
    expect(selected.images.map((image) => image.id)).toEqual(['product-a', 'gift-a'])
  })

  it('keeps non-product evidence out of the seven base image requests', () => {
    const selected = selectRetailPlanInputs(plan({
      id: '01-main',
      order: 1,
      processingMode: 'ai',
      composeMode: 'none',
      specialImageType: undefined,
      requiredSourceRole: undefined,
    }), images, roles)

    expect(selected.useModel).toBe(true)
    expect(selected.images.map((image) => image.id)).toEqual(['product-a'])
  })

  it('omits an ineligible special slot from generate-all targets', () => {
    const plans = [
      plan({ id: '01-main', order: 1, processingMode: 'ai', composeMode: 'none', specialImageType: undefined, requiredSourceRole: undefined }),
      plan({ generationEligible: false, blockedReason: '缺少尺寸' }),
    ]
    const slots: RetailProjectSlot[] = plans.map((item) => ({
      slotId: item.id,
      status: 'idle',
      taskId: null,
      outputImageId: null,
      composedImageId: null,
      error: null,
      qualityStatus: 'unchecked',
    }))

    expect(getRetailGenerationTargets(plans, slots)).toEqual(['01-main'])
  })
})
