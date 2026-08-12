import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type TaskRecord } from '../types'
import {
  collectRetailProjectImageIds,
  createRetailProject,
  normalizeRetailProject,
  syncRetailProjectTasks,
} from './retailProject'

describe('retail project state', () => {
  it('creates a recoverable project with seven base slots and one optional special slot', () => {
    const project = createRetailProject(100)

    expect(project.product.platform).toBe('meituan')
    expect(project.platformPresetId).toBe('meituan-square')
    expect(project.concurrency).toBe(2)
    expect(project.slots).toHaveLength(8)
    expect(project.slots.at(-1)?.slotId).toBe('08-special')
    expect(project.specialImageType).toBe('auto')
    expect(project.sourceImageRoles).toEqual({})
    expect(project.qnhRepair.bridgeUrl).toBe('http://127.0.0.1:8768')
    expect(project.qnhRepair.inventory).toBeNull()
    expect(project.slots.every((slot) => slot.status === 'idle')).toBe(true)
  })

  it('normalizes a persisted QNH repair draft without trusting malformed nested values', () => {
    const normalized = normalizeRetailProject({
      id: 'repair',
      qnhRepair: {
        bridgeUrl: 'http://localhost:8768',
        spuId: '123456',
        inventory: null,
        existingDecisions: { a: { decision: 'remove', reason: '二维码' }, b: { decision: 'bad' } },
        outputReviews: {},
        detachAcknowledged: true,
        planId: 'plan-1',
      },
    }, 200)

    expect(normalized.qnhRepair.bridgeUrl).toBe('http://localhost:8768')
    expect(normalized.qnhRepair.spuId).toBe('123456')
    expect(normalized.qnhRepair.existingDecisions).toEqual({ a: { decision: 'remove', reason: '二维码' } })
    expect(normalized.qnhRepair.detachAcknowledged).toBe(true)
    expect(normalized.qnhRepair.planId).toBe('plan-1')
  })

  it('normalizes a partial persisted project without dropping known values', () => {
    const normalized = normalizeRetailProject({
      id: 'saved',
      product: { name: '可口可乐 330ml' },
      slots: [{ slotId: '01-main', status: 'done', outputImageId: 'image-a' }],
    }, 200)

    expect(normalized.id).toBe('saved')
    expect(normalized.product.name).toBe('可口可乐 330ml')
    expect(normalized.slots).toHaveLength(8)
    expect(normalized.slots[0]).toMatchObject({ status: 'done', outputImageId: 'image-a' })
    expect(normalized.slots.at(-1)).toMatchObject({ slotId: '08-special', status: 'idle' })
  })

  it('preserves valid source roles and drops roles for missing images', () => {
    const normalized = normalizeRetailProject({
      id: 'roles',
      sourceImageIds: ['product-a', 'label-a'],
      sourceImageRoles: {
        'product-a': 'product',
        'label-a': 'back_label',
        'missing-a': 'authentic_document',
      },
      specialImageType: 'back_label',
    }, 200)

    expect(normalized.sourceImageRoles).toEqual({
      'product-a': 'product',
      'label-a': 'back_label',
    })
    expect(normalized.specialImageType).toBe('back_label')
  })

  it('clears a paused local queue that cannot survive a browser restart', () => {
    const normalized = normalizeRetailProject({
      id: 'paused',
      queuePaused: true,
      slots: [{ slotId: '01-main', status: 'queued', taskId: null }],
    }, 200)

    expect(normalized.queuePaused).toBe(false)
    expect(normalized.slots[0].status).toBe('idle')
  })

  it('collects every source, generated, and composed image reference', () => {
    const project = createRetailProject(100)
    project.sourceImageIds = ['source-a', 'source-b']
    project.sourceImageRoles = { 'source-a': 'product', 'source-b': 'authentic_document' }
    project.slots[0] = {
      ...project.slots[0],
      outputImageId: 'output-a',
      composedImageId: 'composed-a',
    }

    expect(collectRetailProjectImageIds(project)).toEqual([
      'source-a',
      'source-b',
      'output-a',
      'composed-a',
    ])
  })

  it('derives running, done, and error slot state from persisted tasks', () => {
    const project = createRetailProject(100)
    project.slots[0] = { ...project.slots[0], taskId: 'task-main', status: 'running' }
    project.slots[1] = { ...project.slots[1], taskId: 'task-front', status: 'running' }

    const task = (id: string, status: TaskRecord['status'], outputImages: string[] = [], error: string | null = null): TaskRecord => ({
      id,
      prompt: 'retail',
      params: { ...DEFAULT_PARAMS },
      inputImageIds: [],
      outputImages,
      status,
      error,
      createdAt: 1,
      finishedAt: status === 'running' ? null : 2,
      elapsed: status === 'running' ? null : 1,
    })

    const synced = syncRetailProjectTasks(project, [
      task('task-main', 'done', ['image-main']),
      task('task-front', 'error', [], 'API timeout'),
    ], 300)

    expect(synced.slots[0]).toMatchObject({ status: 'done', outputImageId: 'image-main' })
    expect(synced.slots[1]).toMatchObject({ status: 'error', error: 'API timeout' })
    expect(synced.updatedAt).toBe(300)
  })
})
