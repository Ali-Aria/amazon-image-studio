import { describe, expect, it } from 'vitest'
import {
  computeSlotSafeBox,
  getRetailOccludedCanvasBox,
  subjectOcclusionArea,
} from './retailSafeBox'
import { getRetailGenerationSize } from './retailPlatform'
import { RETAIL_SLOT_IDS } from './retailPlanner'

const PRESETS = ['meituan-square', 'meituan-landscape', 'taobao-flash-square']

describe('合成层遮挡矩形', () => {
  it('方图预设下文案面板横跨画布 5.5%-53.5%', () => {
    const panel = getRetailOccludedCanvasBox('meituan-square', '03-selling-points')!
    expect(panel.x0).toBeCloseTo(0.055, 4)
    expect(panel.x1).toBeCloseTo(0.535, 4)
    expect(panel.y0).toBeCloseTo(0.055, 4)
    expect(panel.y1).toBeCloseTo(0.945, 4)
  })

  it('横图预设下 pad 按宽度取值，竖直方向的百分比随之变化', () => {
    const panel = getRetailOccludedCanvasBox('meituan-landscape', '06-specification')!
    expect(panel.x1).toBeCloseTo(0.535, 4)
    expect(panel.y0).toBeCloseTo(33 / 450, 4)
    expect(panel.y1).toBeCloseTo(417 / 450, 4)
  })

  it('详情长图与白底主图不被任何东西遮挡', () => {
    expect(getRetailOccludedCanvasBox('meituan-square', '07-detail-page')).toBeNull()
    expect(getRetailOccludedCanvasBox('meituan-square', '01-main')).toBeNull()
  })
})

describe('主体安全区', () => {
  it('任何预设任何图片位，主体安全区与遮挡矩形的交集都必须为 0', () => {
    for (const preset of PRESETS) {
      for (const slotId of RETAIL_SLOT_IDS) {
        expect(subjectOcclusionArea(preset, slotId), `${preset}/${slotId}`).toBe(0)
      }
    }
  })

  it('方图零裁切时生成图坐标等于画布坐标', () => {
    expect(computeSlotSafeBox('meituan-square', '02-front', '1024x1024')).toMatchObject({ x0: 10, x1: 90, y0: 10, y1: 90 })
    expect(computeSlotSafeBox('meituan-square', '03-selling-points', '1024x1024')).toMatchObject({ x0: 60, x1: 95, y0: 12, y1: 88 })
  })

  it('横图 cover 左右各裁 5.56%，画布百分比不能直接当生成图百分比写进 prompt', () => {
    // 1536×1024 cover 进 600×450：drawW=675，左右各溢出 37.5px
    const front = computeSlotSafeBox('meituan-landscape', '02-front', '1536x1024')
    expect(front).toMatchObject({ x0: 14, x1: 86, y0: 10, y1: 90 })

    const spec = computeSlotSafeBox('meituan-landscape', '06-specification', '1536x1024')
    // 画布 60%/95% 映射到生成图 59%/90%——手写 95% 会把商品右缘送进裁切线
    expect(spec).toMatchObject({ x0: 59, x1: 90 })
    // 面板右缘画布 53.5% → 生成图 53.111%，再让 2.5 个点给面板的 6% 透明度
    expect(spec.staticZoneRight).toBe(56)
    expect(spec.x0).toBeGreaterThan(spec.staticZoneRight)
  })

  it('白底主图 contain 会留白边，安全区据此补偿', () => {
    // 1536×1024 contain 进 600×450 得 600×400，上下各 25px 白边
    expect(computeSlotSafeBox('meituan-landscape', '01-main', '1536x1024')).toMatchObject({ x0: 8, x1: 92, y0: 3, y1: 97 })
    // 方图 contain 精确贴合，零 letterbox
    expect(computeSlotSafeBox('meituan-square', '01-main', '1024x1024')).toMatchObject({ x0: 8, x1: 92, y0: 8, y1: 92 })
  })

  it('详情长图的安全区按顶部图带算，不是按整张 750×2000 画布', () => {
    const band = computeSlotSafeBox('meituan-square', '07-detail-page', '1024x1024')
    expect(band).toMatchObject({ y0: 18, y1: 82 })
    // 1024 方图 cover 进 750×860 是左右裁切，所以横向安全区被往内收
    expect(band.x0).toBeGreaterThan(20)
    expect(band.x1).toBeLessThan(80)
  })

  it('留白位的静区右缘一定在主体左缘之左', () => {
    for (const preset of PRESETS) {
      for (const slotId of ['03-selling-points', '06-specification'] as const) {
        const box = computeSlotSafeBox(preset, slotId, getRetailGenerationSize(preset, slotId))
        expect(box.staticZoneRight, `${preset}/${slotId}`).toBeGreaterThan(0)
        expect(box.x0, `${preset}/${slotId}`).toBeGreaterThanOrEqual(box.staticZoneRight)
      }
    }
  })
})

describe('生成尺寸按可见图窗推导', () => {
  it('详情长图不再按 750×2000 推出竖图', () => {
    // 旧实现按最终画布比 0.375 推出 1024x1536，cover 进 750×860 会上下各裁 11.8%
    expect(getRetailGenerationSize('meituan-square', '07-detail-page')).toBe('1024x1024')
  })

  it('其余图片位仍按画布比例推导', () => {
    expect(getRetailGenerationSize('meituan-square', '01-main')).toBe('1024x1024')
    expect(getRetailGenerationSize('meituan-landscape', '01-main')).toBe('1536x1024')
  })
})
