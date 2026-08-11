import type { RetailImagePlan, RetailProduct } from '../types'
import { encodeRetailImage, type RetailEncodeTarget, type RetailEncodedImage } from './retailEncoder'
import {
  RETAIL_DETAIL_BAND_PCT,
  RETAIL_PANEL_PAD_PCT,
  RETAIL_PANEL_WIDTH_PCT,
  RETAIL_SPECIAL_IMAGE_PAD_PCT,
  RETAIL_SPECIAL_IMAGE_X_PCT,
  RETAIL_SPECIAL_PANEL_WIDTH_PCT,
} from './retailGeometry'

export interface RetailCompositionSpec {
  title: string
  subtitle: string
  lines: string[]
  mode: RetailImagePlan['composeMode']
}

const INTERNAL_COPY_PATTERN = /内部|质检|待补充|检查提示|操作说明/g

function cleanVisibleCopy(value: string) {
  return value.replace(INTERNAL_COPY_PATTERN, '').replace(/\s{2,}/g, ' ').trim()
}

export function buildRetailCompositionSpec(plan: RetailImagePlan, product: RetailProduct): RetailCompositionSpec {
  if (plan.processingMode === 'source-only') {
    return { title: '', subtitle: '', lines: [], mode: plan.composeMode }
  }

  const specialTitles = {
    product_facts: '商品信息',
    dimension: '尺寸参数',
    size_guide: '尺码参考',
    gift_pack: '',
    back_label: '',
    authentic_document: '',
  } as const
  const title = plan.composeMode === 'special'
    ? specialTitles[plan.specialImageType ?? 'product_facts']
    : plan.composeMode === 'specification'
    ? '商品规格'
    : plan.composeMode === 'detail'
      ? product.name
      : product.sellingPoints[0] || product.name
  const subtitle = plan.composeMode === 'special'
    ? [product.name, product.saleSpecification].filter(Boolean).join(' · ')
    : plan.composeMode === 'selling-points'
    ? product.saleSpecification
    : plan.composeMode === 'detail'
      ? [product.brand, product.saleSpecification].filter(Boolean).join(' · ')
      : ''

  return {
    title: cleanVisibleCopy(title),
    subtitle: cleanVisibleCopy(subtitle),
    lines: plan.copyLines.map(cleanVisibleCopy).filter(Boolean),
    mode: plan.composeMode,
  }
}

function loadCanvasImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('生成结果无法读取'))
    image.src = dataUrl
  })
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
}

function drawContain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, preferredSize: number, minSize: number, weight = 700) {
  let size = preferredSize
  while (size > minSize) {
    ctx.font = `${weight} ${size}px "HarmonyOS Sans SC", "PingFang SC", sans-serif`
    if (ctx.measureText(text).width <= maxWidth) return size
    size -= 2
  }
  ctx.font = `${weight} ${minSize}px "HarmonyOS Sans SC", "PingFang SC", sans-serif`
  return minSize
}

function drawTextLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, size: number, color: string, weight = 500) {
  fitFont(ctx, text, maxWidth, size, Math.max(16, Math.round(size * 0.62)), weight)
  ctx.fillStyle = color
  ctx.fillText(text, x, y, maxWidth)
}

function drawPanelCopy(ctx: CanvasRenderingContext2D, spec: RetailCompositionSpec, width: number, height: number) {
  const panelWidth = Math.round(width * RETAIL_PANEL_WIDTH_PCT)
  const pad = Math.round(width * RETAIL_PANEL_PAD_PCT)
  const panelX = pad
  const panelY = pad
  const panelHeight = height - pad * 2
  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  ctx.beginPath()
  ctx.roundRect(panelX, panelY, panelWidth, panelHeight, Math.min(16, width * 0.025))
  ctx.fill()
  ctx.fillStyle = '#FFCC33'
  ctx.fillRect(panelX, panelY, Math.max(6, Math.round(width * 0.012)), panelHeight)

  const copyX = panelX + Math.round(width * 0.045)
  const maxWidth = panelWidth - Math.round(width * 0.08)
  let cursorY = panelY + Math.round(height * 0.18)
  const titleSize = Math.max(30, Math.round(width * 0.065))
  drawTextLine(ctx, spec.title, copyX, cursorY, maxWidth, titleSize, '#172033', 800)
  cursorY += Math.round(titleSize * 1.45)
  if (spec.subtitle) {
    drawTextLine(ctx, spec.subtitle, copyX, cursorY, maxWidth, Math.round(width * 0.032), '#687083', 500)
    cursorY += Math.round(width * 0.075)
  }
  // 规划层最多给 8 条规格，写死 slice(0,5) 会静默丢掉后 3 条并在面板下方留一大片空白。
  // 改成按面板剩余高度算能放几条、并据此收紧行距，规划多少就尽量画多少。
  const candidates = spec.lines.filter((value) => value !== spec.title)
  const bottomPad = Math.round(height * 0.06)
  const available = Math.max(0, panelY + panelHeight - bottomPad - cursorY)
  const preferredStep = Math.round(width * 0.062)
  const minStep = Math.round(width * 0.046)
  const capacity = Math.max(1, Math.floor(available / minStep) + 1)
  const visible = candidates.slice(0, Math.min(candidates.length, capacity))
  const step = visible.length > 1
    ? Math.min(preferredStep, Math.max(minStep, Math.floor(available / (visible.length - 1))))
    : preferredStep

  for (const line of visible) {
    ctx.fillStyle = '#FF6B57'
    ctx.beginPath()
    ctx.arc(copyX + 5, cursorY - 7, 4, 0, Math.PI * 2)
    ctx.fill()
    drawTextLine(ctx, line, copyX + 18, cursorY, maxWidth - 18, Math.round(width * 0.03), '#30384A', 600)
    cursorY += step
  }
}

function drawDetailCopy(ctx: CanvasRenderingContext2D, image: HTMLImageElement, spec: RetailCompositionSpec, width: number, height: number) {
  ctx.fillStyle = '#F6F8FA'
  ctx.fillRect(0, 0, width, height)
  const imageHeight = Math.round(height * RETAIL_DETAIL_BAND_PCT)
  drawCover(ctx, image, 0, 0, width, imageHeight)
  const pad = Math.round(width * 0.07)
  let cursorY = imageHeight + Math.round(height * 0.065)
  drawTextLine(ctx, spec.title, pad, cursorY, width - pad * 2, Math.round(width * 0.07), '#172033', 800)
  cursorY += Math.round(width * 0.095)
  if (spec.subtitle) {
    drawTextLine(ctx, spec.subtitle, pad, cursorY, width - pad * 2, Math.round(width * 0.032), '#687083', 500)
    cursorY += Math.round(width * 0.075)
  }
  ctx.fillStyle = '#FFCC33'
  ctx.fillRect(pad, cursorY, Math.round(width * 0.12), 6)
  cursorY += Math.round(width * 0.075)
  // 与 drawPanelCopy 同理：写死 slice(0,10) 会在画布下方还剩 386px 时静默丢掉已确认信息
  const detailLines = spec.lines.filter((value) => value !== spec.title)
  const detailStep = Math.round(width * 0.065)
  const detailCapacity = Math.max(1, Math.floor((height - Math.round(height * 0.04) - cursorY) / detailStep) + 1)
  for (const line of detailLines.slice(0, detailCapacity)) {
    drawTextLine(ctx, line, pad, cursorY, width - pad * 2, Math.round(width * 0.034), '#30384A', 600)
    cursorY += detailStep
  }
}

function drawSpecialCopy(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  spec: RetailCompositionSpec,
  width: number,
  height: number,
  type: RetailImagePlan['specialImageType'],
) {
  ctx.fillStyle = '#F7F9FB'
  ctx.fillRect(0, 0, width, height)

  if (type === 'size_guide') {
    const pad = Math.round(width * 0.07)
    drawTextLine(ctx, spec.title, pad, Math.round(height * 0.14), width - pad * 2, Math.round(width * 0.065), '#172033', 800)
    drawTextLine(ctx, spec.subtitle, pad, Math.round(height * 0.21), width - pad * 2, Math.round(width * 0.028), '#687083', 500)
    let cursorY = Math.round(height * 0.32)
    for (const [index, line] of spec.lines.slice(0, 7).entries()) {
      ctx.fillStyle = index % 2 === 0 ? '#FFFFFF' : '#EEF3F6'
      ctx.fillRect(pad, cursorY - Math.round(height * 0.045), width - pad * 2, Math.round(height * 0.085))
      drawTextLine(ctx, line, pad + Math.round(width * 0.035), cursorY, width - pad * 2.5, Math.round(width * 0.032), '#30384A', 600)
      cursorY += Math.round(height * 0.095)
    }
    return
  }

  const imageX = Math.round(width * RETAIL_SPECIAL_IMAGE_X_PCT)
  const imagePad = Math.round(width * RETAIL_SPECIAL_IMAGE_PAD_PCT)
  drawContain(ctx, image, imageX, imagePad, width - imageX - imagePad, height - imagePad * 2)

  const panelWidth = Math.round(width * RETAIL_SPECIAL_PANEL_WIDTH_PCT)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, panelWidth, height)
  ctx.fillStyle = type === 'dimension' ? '#13A8A8' : '#FFCC33'
  ctx.fillRect(0, 0, Math.max(7, Math.round(width * 0.014)), height)

  const copyX = Math.round(width * 0.065)
  const maxWidth = panelWidth - copyX - Math.round(width * 0.035)
  let cursorY = Math.round(height * 0.18)
  drawTextLine(ctx, spec.title, copyX, cursorY, maxWidth, Math.round(width * 0.06), '#172033', 800)
  cursorY += Math.round(width * 0.09)
  drawTextLine(ctx, spec.subtitle, copyX, cursorY, maxWidth, Math.round(width * 0.025), '#687083', 500)
  cursorY += Math.round(width * 0.08)
  for (const line of spec.lines.slice(0, 7)) {
    drawTextLine(ctx, line, copyX, cursorY, maxWidth, Math.round(width * 0.028), '#30384A', 600)
    cursorY += Math.round(width * 0.062)
  }
}

export async function composeRetailImageDataUrl(
  sourceDataUrl: string,
  plan: RetailImagePlan,
  product: RetailProduct,
  target: RetailEncodeTarget,
): Promise<RetailEncodedImage> {
  const image = await loadCanvasImage(sourceDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = plan.targetSize.width
  canvas.height = plan.targetSize.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持图片排版')

  const spec = buildRetailCompositionSpec(plan, product)
  if (plan.id === '08-special') {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (plan.processingMode === 'source-only') {
      drawContain(ctx, image, 0, 0, canvas.width, canvas.height)
    } else if (plan.specialImageType === 'gift_pack') {
      drawCover(ctx, image, 0, 0, canvas.width, canvas.height)
    } else {
      drawSpecialCopy(ctx, image, spec, canvas.width, canvas.height, plan.specialImageType)
    }
  } else if (plan.composeMode === 'detail') {
    drawDetailCopy(ctx, image, spec, canvas.width, canvas.height)
  } else {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (plan.id === '01-main') drawContain(ctx, image, 0, 0, canvas.width, canvas.height)
    else drawCover(ctx, image, 0, 0, canvas.width, canvas.height)
    if (plan.composeMode !== 'none') drawPanelCopy(ctx, spec, canvas.width, canvas.height)
  }

  return encodeRetailImage((mime, quality) => canvas.toDataURL(mime, quality), target)
}
