import type {
  QnhBridgeHealth,
  QnhExecutionSummary,
  QnhInventorySnapshot,
  QnhPlanSummary,
  QnhRepairPlanRequest,
} from '../types'
import { normalizeQnhBridgeUrl } from './qnhRepair'

async function requestJson<T>(
  bridgeUrl: string,
  path: string,
  init: Pick<RequestInit, 'method' | 'body'>,
): Promise<T> {
  const baseUrl = normalizeQnhBridgeUrl(bridgeUrl)
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method,
    body: init.body,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    cache: 'no-store',
    credentials: 'omit',
  })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `QNH Bridge 请求失败（HTTP ${response.status}）`
    throw new Error(message)
  }
  return payload as T
}

export function fetchQnhBridgeHealth(bridgeUrl: string) {
  return requestJson<QnhBridgeHealth>(bridgeUrl, '/v1/health', { method: 'GET' })
}

export function fetchQnhInventory(bridgeUrl: string, spuId: string) {
  if (!/^\d+$/.test(spuId.trim())) return Promise.reject(new Error('SPU ID 必须是数字'))
  return requestJson<QnhInventorySnapshot>(bridgeUrl, '/v1/inventory', {
    method: 'POST',
    body: JSON.stringify({ spuId: spuId.trim() }),
  })
}

export function createQnhRepairPlan(bridgeUrl: string, plan: QnhRepairPlanRequest) {
  return requestJson<QnhPlanSummary>(bridgeUrl, '/v1/plans', {
    method: 'POST',
    body: JSON.stringify(plan),
  })
}

export function fetchQnhRepairPlan(bridgeUrl: string, planId: string) {
  return requestJson<QnhExecutionSummary>(bridgeUrl, `/v1/plans/${encodeURIComponent(planId)}`, { method: 'GET' })
}

export function executeQnhRepairPlan(bridgeUrl: string, planId: string, confirmationPhrase: string) {
  return requestJson<QnhExecutionSummary>(bridgeUrl, `/v1/plans/${encodeURIComponent(planId)}/execute`, {
    method: 'POST',
    body: JSON.stringify({ confirmationPhrase }),
  })
}
