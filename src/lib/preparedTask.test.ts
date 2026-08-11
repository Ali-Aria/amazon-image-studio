import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type ApiProfile } from '../types'
import { createPreparedTaskRecord } from './preparedTask'

const profile: ApiProfile = {
  id: 'profile-a',
  name: 'Image API',
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'key',
  model: 'gpt-image-1',
  timeout: 120,
  apiMode: 'images',
  codexCli: false,
  apiProxy: false,
}

describe('prepared task records', () => {
  it('captures independent retail inputs without reading the gallery draft', () => {
    const task = createPreparedTaskRecord({
      id: 'task-a',
      now: 100,
      prompt: '  Generate the exact product  ',
      params: { ...DEFAULT_PARAMS, size: '1024x1024' },
      inputImageIds: ['source-a'],
      profile,
      category: {
        workflow: 'instant-retail',
        productTitle: 'RIO 微醺白桃味鸡尾酒',
        retailProjectId: 'project-a',
        retailSlot: '01-main',
      },
    })

    expect(task).toMatchObject({
      id: 'task-a',
      prompt: 'Generate the exact product',
      inputImageIds: ['source-a'],
      apiProfileId: 'profile-a',
      apiModel: 'gpt-image-1',
      status: 'running',
      createdAt: 100,
      category: { workflow: 'instant-retail', retailSlot: '01-main' },
    })
  })
})
