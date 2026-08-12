import { describe, expect, it } from 'vitest'
import type {
  QnhInventorySnapshot,
  QnhOutputReview,
  QnhRepairDraft,
  RetailProject,
} from '../types'
import { createRetailProject } from './retailProject'
import {
  applyQnhInventory,
  buildQnhRepairPlanRequest,
  createEmptyQnhRepairDraft,
  getQnhRepairReadiness,
  normalizeQnhBridgeUrl,
} from './qnhRepair'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

function inventory(fingerprint = 'inventory-a'): QnhInventorySnapshot {
  return {
    spuId: '123456789',
    productName: '测试商品 500ml',
    mainImages: [
      { id: 'main:0', kind: 'main', index: 0, url: 'https://img.example/main-0.jpg' },
      { id: 'main:1', kind: 'main', index: 1, url: 'https://img.example/main-1.jpg' },
    ],
    detailImages: [
      { id: 'detail:0', kind: 'detail', index: 0, url: 'https://img.example/detail-0.jpg' },
    ],
    specialImages: [
      {
        pictureType: 22,
        label: '选购指南图',
        required: true,
        images: [{ id: 'special:22:0', kind: 'special', index: 0, pictureType: 22, url: 'https://img.example/special.jpg' }],
      },
    ],
    customizedMain: false,
    customizedDetail: false,
    fingerprint,
    fetchedAt: '2026-08-12T12:00:00Z',
  }
}

function passedReview(overrides: Partial<QnhOutputReview> = {}): QnhOutputReview {
  return {
    slotId: '01-main',
    target: 'main',
    pictureType: null,
    sourceImageId: 'source-a',
    outputImageId: 'output-a',
    sourceRole: 'product',
    processingMode: 'ai',
    verdict: 'pass',
    checklist: {
      packagingText: true,
      brand: true,
      specification: true,
      color: true,
      unitCount: true,
      structure: true,
    },
    note: '逐项核对一致',
    ...overrides,
  }
}

function reviewedDraft(): QnhRepairDraft {
  return {
    ...createEmptyQnhRepairDraft(),
    spuId: '123456789',
    inventory: inventory(),
    existingDecisions: {
      'main:0': { decision: 'keep', reason: '' },
      'main:1': { decision: 'remove', reason: '其他平台水印' },
      'detail:0': { decision: 'keep', reason: '' },
      'special:22:0': { decision: 'keep', reason: '' },
    },
    outputReviews: { '01-main': passedReview() },
    detachAcknowledged: true,
  }
}

describe('QNH repair domain', () => {
  it('accepts only loopback HTTP bridge URLs', () => {
    expect(normalizeQnhBridgeUrl('http://localhost:8768/')).toBe('http://localhost:8768')
    expect(normalizeQnhBridgeUrl('http://127.0.0.1:8768')).toBe('http://127.0.0.1:8768')
    expect(() => normalizeQnhBridgeUrl('https://127.0.0.1:8768')).toThrow(/HTTP/)
    expect(() => normalizeQnhBridgeUrl('http://192.168.1.5:8768')).toThrow(/本机回环/)
    expect(() => normalizeQnhBridgeUrl('http://localhost:8768/path')).toThrow(/根地址/)
  })

  it('creates an empty, recoverable repair draft', () => {
    expect(createEmptyQnhRepairDraft()).toEqual({
      bridgeUrl: 'http://127.0.0.1:8768',
      spuId: '',
      inventory: null,
      existingDecisions: {},
      outputReviews: {},
      detachAcknowledged: false,
      planId: null,
      planSummary: null,
      execution: null,
    })
  })

  it('invalidates reviews and plan state when a fresh inventory fingerprint changes', () => {
    const current = reviewedDraft()
    current.planId = 'plan-old'
    current.planSummary = {
      planId: 'plan-old',
      sha256: 'abc',
      confirmationPhrase: '确认执行 ABC123',
      addedMain: 1,
      addedDetail: 0,
      addedSpecial: 0,
      removed: 1,
      status: 'planned',
    }

    const same = applyQnhInventory(current, inventory())
    expect(same.existingDecisions).toEqual(current.existingDecisions)

    const changed = applyQnhInventory(current, inventory('inventory-b'))
    expect(changed.existingDecisions).toEqual({})
    expect(changed.outputReviews).toEqual({})
    expect(changed.detachAcknowledged).toBe(false)
    expect(changed.planId).toBeNull()
  })

  it('blocks a plan until every existing image has a keep/remove decision', () => {
    const draft = reviewedDraft()
    delete draft.existingDecisions['detail:0']

    const readiness = getQnhRepairReadiness(draft)
    expect(readiness.ready).toBe(false)
    expect(readiness.issues).toContain('还有 1 张现有图片未审核')
  })

  it('requires a reason for every removal', () => {
    const draft = reviewedDraft()
    draft.existingDecisions['main:1'] = { decision: 'remove', reason: '  ' }

    expect(getQnhRepairReadiness(draft).issues).toContain('剔除图片必须填写原因')
  })

  it('requires distinct source/output images and all authenticity checks for PASS', () => {
    const draft = reviewedDraft()
    draft.outputReviews['01-main'] = passedReview({
      sourceImageId: 'same-image',
      outputImageId: 'same-image',
      checklist: { ...passedReview().checklist, packagingText: false },
    })

    const issues = getQnhRepairReadiness(draft).issues.join('\n')
    expect(issues).toMatch(/真实来源图不能与成图相同/)
    expect(issues).toMatch(/包装保真核对未完成/)
  })

  it('requires an explicit pictureType for a special output', () => {
    const draft = reviewedDraft()
    draft.outputReviews['08-special'] = passedReview({
      slotId: '08-special',
      target: 'special',
      pictureType: null,
    })

    expect(getQnhRepairReadiness(draft).issues).toContain('特殊图必须选择牵牛花 pictureType')
  })

  it('allows authentic documents and back labels only in source-only mode', () => {
    const draft = reviewedDraft()
    draft.outputReviews['08-special'] = passedReview({
      slotId: '08-special',
      target: 'special',
      pictureType: 24,
      sourceRole: 'authentic_document',
      processingMode: 'ai',
    })

    expect(getQnhRepairReadiness(draft).issues).toContain('证照或背标只能原图直传，禁止 AI 生成')
  })

  it('builds a plan with reviewed removals and only PASS outputs', () => {
    const project: RetailProject = createRetailProject(100)
    project.product.name = '测试商品 500ml'
    project.product.barcode = '6900000000000'
    project.product.sku = 'SKU-001'
    project.qnhRepair = reviewedDraft()

    const request = buildQnhRepairPlanRequest({
      project,
      health: {
        version: '1.0.0',
        mode: 'fake',
        storeName: '演练门店',
        tenantId: '1013857',
        storeId: '1312360',
        busy: false,
        activePlanId: null,
      },
      imageDataUrls: { 'source-a': PNG, 'output-a': PNG },
    })

    expect(request.schemaVersion).toBe(1)
    expect(request.identity.storeName).toBe('演练门店')
    expect(request.inventory.fingerprint).toBe('inventory-a')
    expect(request.inventory.decisions).toHaveLength(4)
    expect(request.inventory.decisions.find((item) => item.imageId === 'main:1')).toMatchObject({ decision: 'remove', reason: '其他平台水印' })
    expect(request.outputs).toHaveLength(1)
    expect(request.outputs[0]).toMatchObject({ slotId: '01-main', target: 'main', sourceImageId: 'source-a', outputImageId: 'output-a' })
  })
})
