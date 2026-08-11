import type { RetailSlotId } from '../types'
import { getRetailSlotOutputSize } from './retailPlatform'
import {
  RETAIL_DETAIL_BAND_PCT,
  RETAIL_PANEL_PAD_PCT,
  RETAIL_PANEL_WIDTH_PCT,
} from './retailGeometry'

export * from './retailGeometry'

/** 各边取值 0..1 的归一化矩形 */
export interface RetailBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface RetailSafeBox {
  /** 生成图坐标系下的主体外接框，单位为百分比整数 */
  x0: number
  y0: number
  x1: number
  y1: number
  /** 生成图坐标系下必须保持低细节浅色的静区右缘；无遮挡时为 0 */
  staticZoneRight: number
}

type FitMode = 'cover' | 'contain'

function overlaps(a: RetailBox, b: RetailBox) {
  return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
    * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
}

export function retailBoxOverlapArea(a: RetailBox, b: RetailBox) {
  return overlaps(a, b)
}

/** 合成层在画布上盖住的矩形；不盖任何东西的图片位返回 null */
export function getRetailOccludedCanvasBox(presetId: string, slotId: RetailSlotId): RetailBox | null {
  const size = getRetailSlotOutputSize(presetId, slotId)
  if (slotId === '03-selling-points' || slotId === '06-specification') {
    // drawPanelCopy：pad 与 panelWidth 都按**宽度**取值，所以竖直方向的百分比随画幅比例变化
    const pad = Math.round(size.width * RETAIL_PANEL_PAD_PCT)
    const panelWidth = Math.round(size.width * RETAIL_PANEL_WIDTH_PCT)
    return {
      x0: pad / size.width,
      x1: (pad + panelWidth) / size.width,
      y0: pad / size.height,
      y1: (size.height - pad) / size.height,
    }
  }
  // 07 的文案画在顶部图带**下方**，图带本身不被遮挡，所以这一位不需要留白指令；
  // 08 的白卡与配图在 drawSpecialCopy 里左右分区不重叠，gift_pack 走整幅 drawCover。
  return null
}

/** 画布上真正留给生成图的窗口（07 只用顶部图带，其余是整幅画布） */
function getRetailImageWindow(presetId: string, slotId: RetailSlotId) {
  const size = getRetailSlotOutputSize(presetId, slotId)
  if (slotId === '07-detail-page') {
    return { width: size.width, height: Math.round(size.height * RETAIL_DETAIL_BAND_PCT) }
  }
  return size
}

function parseGenerationSize(generationSize: string) {
  const [width, height] = generationSize.split('x').map(Number)
  return { width: width || 1024, height: height || 1024 }
}

/**
 * 把画布坐标映射回生成图坐标。cover 会裁掉生成图的两侧或上下，
 * contain 会在画布上留出白边——两种情况下「画布 92%」对应的生成图百分比都不是 92%。
 */
export function mapCanvasBoxToGenerationBox(
  canvasBox: RetailBox,
  generationSize: string,
  window: { width: number; height: number },
  mode: FitMode,
): RetailBox {
  const gen = parseGenerationSize(generationSize)
  const scale = mode === 'cover'
    ? Math.max(window.width / gen.width, window.height / gen.height)
    : Math.min(window.width / gen.width, window.height / gen.height)
  const drawWidth = gen.width * scale
  const drawHeight = gen.height * scale
  const offsetX = (window.width - drawWidth) / 2
  const offsetY = (window.height - drawHeight) / 2
  const toGen = (canvasFraction: number, windowSize: number, offset: number, drawSize: number) =>
    (canvasFraction * windowSize - offset) / drawSize

  return {
    x0: toGen(canvasBox.x0, window.width, offsetX, drawWidth),
    x1: toGen(canvasBox.x1, window.width, offsetX, drawWidth),
    y0: toGen(canvasBox.y0, window.height, offsetY, drawHeight),
    y1: toGen(canvasBox.y1, window.height, offsetY, drawHeight),
  }
}

/** 每个图片位期望的主体外接框，画布坐标系 */
const CANVAS_SUBJECT_BOX: Record<RetailSlotId, RetailBox> = {
  '01-main': { x0: 0.08, x1: 0.92, y0: 0.08, y1: 0.92 },
  '02-front': { x0: 0.10, x1: 0.90, y0: 0.10, y1: 0.90 },
  '03-selling-points': { x0: 0.60, x1: 0.95, y0: 0.12, y1: 0.88 },
  '04-detail': { x0: 0.10, x1: 0.90, y0: 0.10, y1: 0.90 },
  '05-scene': { x0: 0.18, x1: 0.82, y0: 0.12, y1: 0.88 },
  '06-specification': { x0: 0.60, x1: 0.95, y0: 0.12, y1: 0.88 },
  '07-detail-page': { x0: 0.20, x1: 0.80, y0: 0.18, y1: 0.82 },
  '08-special': { x0: 0.13, x1: 0.87, y0: 0.10, y1: 0.90 },
}

const CONTAIN_SLOTS = new Set<RetailSlotId>(['01-main'])

function clampPercent(value: number) {
  return Math.round(Math.min(100, Math.max(0, value * 100)))
}

/**
 * 算出某个图片位在**生成图坐标系**下的主体安全区。
 * prompt 里的百分比必须来自这里，不能手写：landscape 预设下 cover 会左右各裁 5.56%，
 * 画布 95% 其实只对应生成图 90%，手写 95% 会把商品边缘送进裁切线。
 */
export function computeSlotSafeBox(presetId: string, slotId: RetailSlotId, generationSize: string): RetailSafeBox {
  const window = getRetailImageWindow(presetId, slotId)
  const mode: FitMode = CONTAIN_SLOTS.has(slotId) ? 'contain' : 'cover'
  const canvasBox = CANVAS_SUBJECT_BOX[slotId]
  const genBox = mapCanvasBoxToGenerationBox(canvasBox, generationSize, window, mode)

  const occluded = getRetailOccludedCanvasBox(presetId, slotId)
  let staticZoneRight = 0
  if (occluded && (slotId === '03-selling-points' || slotId === '06-specification')) {
    const occludedGen = mapCanvasBoxToGenerationBox(occluded, generationSize, window, mode)
    // 面板只有 94% 不透明，紧贴右缘的主体会在边界透出脏影，所以静区再往右让 2.5 个点
    staticZoneRight = clampPercent(Math.min(1, occludedGen.x1 + 0.025))
  }

  return {
    x0: clampPercent(genBox.x0),
    x1: clampPercent(genBox.x1),
    y0: clampPercent(genBox.y0),
    y1: clampPercent(genBox.y1),
    staticZoneRight,
  }
}

/**
 * 构建期/测试期断言用：主体安全区映射回画布后，与合成层遮挡矩形的交集面积。
 * 任何 composeMode ≠ 'none' 的位，这个值必须是 0。
 */
export function subjectOcclusionArea(presetId: string, slotId: RetailSlotId): number {
  const occluded = getRetailOccludedCanvasBox(presetId, slotId)
  if (!occluded) return 0
  return retailBoxOverlapArea(CANVAS_SUBJECT_BOX[slotId], occluded)
}

export function getRetailCanvasSubjectBox(slotId: RetailSlotId): RetailBox {
  return { ...CANVAS_SUBJECT_BOX[slotId] }
}
