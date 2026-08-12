import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QnhRepairPlanRequest } from '../types'
import {
  createQnhRepairPlan,
  executeQnhRepairPlan,
  fetchQnhBridgeHealth,
  fetchQnhInventory,
  fetchQnhRepairPlan,
} from './qnhBridgeClient'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('QNH bridge client', () => {
  it('calls the fixed health endpoint without credentials or browser cache', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      version: '1.0.0', mode: 'fake', storeName: '演练店', tenantId: '1', storeId: '2', busy: false, activePlanId: null,
    }))
    globalThis.fetch = fetchMock as typeof fetch

    const health = await fetchQnhBridgeHealth('http://127.0.0.1:8768/')

    expect(health.storeName).toBe('演练店')
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8768/v1/health', expect.objectContaining({
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
    }))
  })

  it('posts only the numeric SPU to the inventory endpoint', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ spuId: '123', fingerprint: 'abc' }))
    globalThis.fetch = fetchMock as typeof fetch

    await fetchQnhInventory('http://localhost:8768', '123')

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8768/v1/inventory', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ spuId: '123' }),
    }))
  })

  it('posts immutable plan data to the one plan-creation endpoint', async () => {
    const request = { schemaVersion: 1 } as QnhRepairPlanRequest
    const fetchMock = vi.fn(async () => jsonResponse({ planId: 'plan-1' }))
    globalThis.fetch = fetchMock as typeof fetch

    await createQnhRepairPlan('http://127.0.0.1:8768', request)

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8768/v1/plans', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(request),
    }))
  })

  it('encodes a plan id and posts only the confirmation phrase during execution', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ status: 'succeeded' }))
    globalThis.fetch = fetchMock as typeof fetch

    await fetchQnhRepairPlan('http://127.0.0.1:8768', 'plan id/1')
    await executeQnhRepairPlan('http://127.0.0.1:8768', 'plan id/1', '确认执行 ABC123')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8768/v1/plans/plan%20id%2F1')
    expect(fetchMock.mock.calls[1]).toEqual([
      'http://127.0.0.1:8768/v1/plans/plan%20id%2F1/execute',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ confirmationPhrase: '确认执行 ABC123' }) }),
    ])
  })

  it('surfaces the bridge JSON error instead of a generic HTTP message', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: '图集已变化，请重新读取' }, { status: 409 })) as typeof fetch

    await expect(fetchQnhInventory('http://127.0.0.1:8768', '123')).rejects.toThrow('图集已变化，请重新读取')
  })

  it('rejects non-loopback addresses and invalid SPUs before fetch', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as typeof fetch

    await expect(fetchQnhBridgeHealth('http://10.0.0.8:8768')).rejects.toThrow(/本机回环/)
    await expect(fetchQnhInventory('http://127.0.0.1:8768', '../123')).rejects.toThrow(/数字/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
