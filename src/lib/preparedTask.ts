import type { ApiProfile, TaskParams, TaskRecord } from '../types'

interface CreatePreparedTaskRecordInput {
  id: string
  now: number
  prompt: string
  params: TaskParams
  inputImageIds: string[]
  profile: ApiProfile
  category: NonNullable<TaskRecord['category']>
}

export function createPreparedTaskRecord(input: CreatePreparedTaskRecordInput): TaskRecord {
  return {
    id: input.id,
    prompt: input.prompt.trim(),
    params: input.params,
    apiProvider: input.profile.provider,
    apiProfileId: input.profile.id,
    apiProfileName: input.profile.name,
    apiMode: input.profile.apiMode,
    apiModel: input.profile.model,
    inputImageIds: [...input.inputImageIds],
    maskTargetImageId: null,
    maskImageId: null,
    outputImages: [],
    status: 'running',
    error: null,
    createdAt: input.now,
    finishedAt: null,
    elapsed: null,
    category: input.category,
  }
}
