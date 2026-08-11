import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type TaskRecord } from '../types'
import {
  collectRetailProjectImageIds,
  createRetailProject,
  normalizeRetailProject,
  syncRetailProjectTasks,
} from './retailProject'

describe('retail project state', () => {
  it('creates a recoverable project with all seven independent slots', () => {
    const project = createRetailProject(100)

    expect(project.product.platform).toBe('meituan')
    expect(project.platformPresetId).toBe('meituan-square')
    expect(project.concurrency).toBe(2)
    expect(project.slots).toHaveLength(7)
    expect(project.slots.every((slot) => slot.status === 'idle')).toBe(true)
  })

  it('normalizes a partial persisted project without dropping known values', () => {
    const normalized = normalizeRetailProject({
      id: 'saved',
      product: { name: '可口可乐 330ml' },
      slots: [{ slotId: '01-main', status: 'done', outputImageId: 'image-a' }],
    }, 200)

    expect(normalized.id).toBe('saved')
    expect(normalized.product.name).toBe('可口可乐 330ml')
    expect(normalized.slots).toHaveLength(7)
    expect(normalized.slots[0]).toMatchObject({ status: 'done', outputImageId: 'image-a' })
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
