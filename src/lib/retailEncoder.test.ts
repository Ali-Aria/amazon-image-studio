import { describe, expect, it, vi } from 'vitest'
import { encodeRetailImage, retailImageExtension, RETAIL_QUALITY_STEPS } from './retailEncoder'

/** 构造一个体积随画质线性下降的假编码器，base 为 quality=1 时的字节数 */
function fakeEncoder(base: number, pngMultiplier = 3) {
  return vi.fn((mime: string, quality?: number) => {
    const bytes = mime === 'image/png' ? base * pngMultiplier : Math.round(base * (quality ?? 1))
    // dataUrl 的 base64 载荷长度约为字节数的 4/3
    return `data:${mime};base64,${'A'.repeat(Math.ceil(bytes / 3) * 4)}`
  })
}

describe('encodeRetailImage', () => {
  it('无体积上限时按目标格式一次编码', () => {
    const encode = fakeEncoder(1000)
    const result = encodeRetailImage(encode, { format: 'jpeg', maxBytes: null })
    expect(encode).toHaveBeenCalledTimes(1)
    expect(result.mime).toBe('image/jpeg')
    expect(result.quality).toBe(RETAIL_QUALITY_STEPS[0])
    expect(result.withinBudget).toBe(true)
  })

  it('有损格式逐档降质，命中上限即停', () => {
    const encode = fakeEncoder(1_000_000)
    const result = encodeRetailImage(encode, { format: 'jpeg', maxBytes: 850_000 })
    expect(result.withinBudget).toBe(true)
    expect(result.bytes).toBeLessThanOrEqual(850_000)
    expect(result.quality).toBe(0.8)
    expect(result.downgraded).toBe(false)
  })

  it('PNG 在上限内时保留 PNG', () => {
    const encode = fakeEncoder(100_000)
    const result = encodeRetailImage(encode, { format: 'png', maxBytes: 5 * 1024 * 1024 })
    expect(result.mime).toBe('image/png')
    expect(result.downgraded).toBe(false)
    expect(result.withinBudget).toBe(true)
  })

  it('PNG 超限时降级为 JPEG 并标记', () => {
    const encode = fakeEncoder(4_000_000)
    const result = encodeRetailImage(encode, { format: 'png', maxBytes: 5 * 1024 * 1024 })
    expect(result.mime).toBe('image/jpeg')
    expect(result.downgraded).toBe(true)
    expect(result.withinBudget).toBe(true)
    expect(result.bytes).toBeLessThanOrEqual(5 * 1024 * 1024)
  })

  it('所有档位都超限时返回最小的一版并标记未达标', () => {
    const encode = fakeEncoder(10_000_000)
    const result = encodeRetailImage(encode, { format: 'jpeg', maxBytes: 1000 })
    expect(result.withinBudget).toBe(false)
    expect(result.quality).toBe(RETAIL_QUALITY_STEPS[RETAIL_QUALITY_STEPS.length - 1])
  })

  it('扩展名按实际 mime 给出', () => {
    expect(retailImageExtension('image/jpeg')).toBe('jpg')
    expect(retailImageExtension('image/webp')).toBe('webp')
    expect(retailImageExtension('image/png')).toBe('png')
  })
})
