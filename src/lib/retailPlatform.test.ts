import { describe, expect, it } from 'vitest'
import { getRetailPlatformPreset, getRetailSlotOutputSize, RETAIL_PLATFORM_PRESETS } from './retailPlatform'

describe('retail platform presets', () => {
  it('provides official Meituan square and landscape main-image presets', () => {
    expect(RETAIL_PLATFORM_PRESETS['meituan-square'].main).toMatchObject({ width: 600, height: 600 })
    expect(RETAIL_PLATFORM_PRESETS['meituan-landscape'].main).toMatchObject({ width: 600, height: 450 })
    expect(RETAIL_PLATFORM_PRESETS['meituan-square'].maxBytes).toBe(5 * 1024 * 1024)
  })

  it('keeps Taobao Flash as an editable business preset instead of claiming an official limit', () => {
    const preset = getRetailPlatformPreset('taobao-flash-square')
    expect(preset.platform).toBe('taobao_flash')
    expect(preset.source).toBe('business-default')
    expect(preset.editable).toBe(true)
  })

  it('uses a portrait canvas only for the detail-page slot', () => {
    expect(getRetailSlotOutputSize('meituan-square', '01-main')).toEqual({ width: 600, height: 600 })
    expect(getRetailSlotOutputSize('meituan-square', '07-detail-page')).toEqual({ width: 750, height: 2000 })
  })
})
