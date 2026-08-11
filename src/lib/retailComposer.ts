import type { RetailImagePlan, RetailProduct } from '../types'

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
  const title = plan.composeMode === 'specification'
    ? '商品规格'
    : plan.composeMode === 'detail'
      ? product.name
      : product.sellingPoints[0] || product.name
  const subtitle = plan.composeMode === 'selling-points'
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
  const panelWidth = Math.round(width * 0.48)
  const pad = Math.round(width * 0.055)
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
  for (const line of spec.lines.filter((value) => value !== spec.title).slice(0, 5)) {
    ctx.fillStyle = '#FF6B57'
    ctx.beginPath()
    ctx.arc(copyX + 5, cursorY - 7, 4, 0, Math.PI * 2)
    ctx.fill()
    drawTextLine(ctx, line, copyX + 18, cursorY, maxWidth - 18, Math.round(width * 0.03), '#30384A', 600)
    cursorY += Math.round(width * 0.062)
  }
}

function drawDetailCopy(ctx: CanvasRenderingContext2D, image: HTMLImageElement, spec: RetailCompositionSpec, width: number, height: number) {
  ctx.fillStyle = '#F6F8FA'
  ctx.fillRect(0, 0, width, height)
  const imageHeight = Math.round(height * 0.43)
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
  for (const line of spec.lines.filter((value) => value !== spec.title).slice(0, 10)) {
    drawTextLine(ctx, line, pad, cursorY, width - pad * 2, Math.round(width * 0.034), '#30384A', 600)
    cursorY += Math.round(width * 0.065)
  }
}

export async function composeRetailImageDataUrl(sourceDataUrl: string, plan: RetailImagePlan, product: RetailProduct) {
  const image = await loadCanvasImage(sourceDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = plan.targetSize.width
  canvas.height = plan.targetSize.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持图片排版')

  const spec = buildRetailCompositionSpec(plan, product)
  if (plan.composeMode === 'detail') {
    drawDetailCopy(ctx, image, spec, canvas.width, canvas.height)
  } else {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (plan.id === '01-main') drawContain(ctx, image, 0, 0, canvas.width, canvas.height)
    else drawCover(ctx, image, 0, 0, canvas.width, canvas.height)
    if (plan.composeMode !== 'none') drawPanelCopy(ctx, spec, canvas.width, canvas.height)
  }

  return canvas.toDataURL('image/png')
}
