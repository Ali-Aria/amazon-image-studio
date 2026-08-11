import type { RetailSlotId } from '../types'
import type { RetailSafeBox } from './retailSafeBox'

/**
 * 创造预算：模型在这一位被允许创造到什么程度。
 * P1 只许换光与背景 / P2 只许在参考图已存在的表面上改机位景别 / P3 可造环境但不造物件。
 * 商品本体的像素在任何预算下都不允许模型创造。
 */
export type RetailCreationBudget = 'P1' | 'P2' | 'P3'

/** 风格双通道：白底与规格位只吃打光，场景位才吃道具与环境 */
export type RetailStyleChannel = 'lighting' | 'lighting+set'

export interface RetailSlotRecipe {
  slotId: RetailSlotId
  budget: RetailCreationBudget
  styleChannel: RetailStyleChannel
  /** 是否需要给 Canvas 文案面板留静区 */
  reservesCopyArea: boolean
  task: string
  framing: string
  surface: string
  light: string
  mayCreate: string
  /** 这一位专属负面词，全小写英文名词短语 */
  slotNegatives: string[]
  /** 末行 RESTATE，吃模型的近因效应 */
  restate: string
}

/** 全部生成位共用：这几类表面一旦被模型重绘，就从「画得丑」升级成「伪造合规信息」 */
export const RETAIL_OUT_OF_FRAME = [
  'barcode',
  'ingredient list',
  'nutrition table',
  'certification mark',
  'date code',
  'warning paragraph',
  'human face',
]

/** 合规红线，逐位负面之外统一追加 */
export const RETAIL_SHARED_NEGATIVES = [
  'altered packaging',
  'redrawn label text',
  'invented specification',
  'warped logo',
  'price tag',
  'coupon',
  'discount badge',
  'qr code',
  'watermark',
  'contact information',
  'rating star',
  'sales ranking',
  'other platform logo',
  'placeholder text',
]

/**
 * 印刷内容是像素不是字符——这句是整套配方里最重要的一条：
 * 模型一旦把包装文字当「字符」重排，净含量、口味、品牌就会被改写。
 */
const PRINTED_PIXELS_RULE =
  'Printed material is PIXELS, not characters: copy every printed glyph, its typeface, size, position and colour directly from the reference. Never re-typeset, translate, complete a partial character, or sharpen text by redrawing it.'

export const RETAIL_SLOT_RECIPES: Record<RetailSlotId, RetailSlotRecipe> = {
  '01-main': {
    slotId: '01-main',
    budget: 'P1',
    styleChannel: 'lighting',
    reservesCopyArea: false,
    task: 'one upload-ready pure-white-background main image of {{name}} for an instant-retail listing',
    framing: 'straight-on eye-level packshot, 85-100mm equivalent, azimuth 0 degrees, tilt 0-5 degrees, no perspective distortion, the complete product in frame and never cropped',
    surface: 'pure white RGB 255,255,255, seamless, no gradient, no horizon line, no floor, no reflection. The only dark area allowed is a faint contact shadow directly under the base',
    light: 'large soft frontal key with even side fill, ratio 1.5:1 or flatter, no blown highlight, no colour cast',
    mayCreate: 'the white background, the contact shadow, global exposure and white balance. Nothing on the product itself',
    slotNegatives: ['props', 'gift ribbon', 'decorative paper', 'sticker', 'border', 'gradient background', 'off-white background', 'reflective floor', 'hand', 'tabletop'],
    restate: 'pure white background, one complete uncropped product, no prop and no added text',
  },
  '02-front': {
    slotId: '02-front',
    budget: 'P1',
    styleChannel: 'lighting',
    reservesCopyArea: false,
    task: 'one front-facing product image of {{name}} that lets a reviewer read the brand and the pack front exactly as printed',
    framing: 'the lens axis is perpendicular to the main label plane, 50-85mm equivalent, azimuth 0 degrees, tilt 8-12 degrees, rotation 5 degrees or less, the complete product in frame',
    surface: 'plain light neutral seamless background in the 235-246 grey range, one soft surface-to-background transition allowed low in the frame. No shelf, no signage, no other packaging, no fabric or marble texture',
    light: 'soft broad frontal key, even across the label plane, no specular hotspot on the printed area',
    mayCreate: 'background, surface, exposure and white balance, and a small orientation adjustment that squares the label to the lens',
    slotNegatives: ['re-typeset text', 'translated packaging', 'altered wordmark', 'changed net content', 'three-quarter view', 'back label', 'tilted label plane', 'textured backdrop', 'shelf', 'other branded packaging', 'hand'],
    restate: 'the printed front face reproduced exactly as photographed, squared to the lens, nothing added to the package',
  },
  '03-selling-points': {
    slotId: '03-selling-points',
    budget: 'P2',
    styleChannel: 'lighting',
    reservesCopyArea: true,
    task: 'one mid-shot commercial image of {{name}} sitting to the right of a clean empty area that a copy panel will later cover',
    framing: 'mid shot with the complete product in frame and never cropped, this is not a close-up, 70-85mm equivalent, tilt 12-18 degrees, three-quarter rotation up to {{rotationCap}}',
    surface: 'a light environment or minimal riser consistent with the product may appear on the right. The reserved area on the left must stay low-detail and light, brighter than RGB 235, with no texture, no gradient banding, no vignette and no shadow falling into it',
    light: 'soft directional key from the upper right so that shadows fall away from the reserved area',
    mayCreate: 'background, riser, lighting and camera position only',
    slotNegatives: ['object crossing the reserved area', 'shadow in the reserved area', 'gradient banding', 'texture in the empty area', 'dark background', 'macro close-up', 'callout', 'arrow', 'icon', 'badge', 'ribbon'],
    restate: 'the whole product sits inside the stated bounding box on the right, the reserved area stays empty and light',
  },
  '04-detail': {
    slotId: '04-detail',
    budget: 'P2',
    styleChannel: 'lighting',
    reservesCopyArea: false,
    task: 'one macro detail image of {{name}} that crops in on a surface already visible in the reference',
    framing: '100mm equivalent macro, raking angle 20-45 degrees, shallow depth of field, the target surface sharp edge to edge. Crop in on {{detailTarget}}. Only crop into a surface that is already visible in the reference; never synthesise a surface the reference does not show',
    surface: 'the same surface continuing out of focus behind the subject, or a clean light defocused plane. Background visible in no more than 15 percent of the frame',
    light: 'one raking key that reveals texture and relief, soft fill on the shadow side',
    mayCreate: 'camera distance, focal plane, background blur and lighting only',
    slotNegatives: ['whole product shot', 'invented interior', 'invented cross-section', 'cut-open package', 'sliced product', 'poured contents', 'plated dish', 'invented texture', 'invented seam', 'completed partial character', 'second unit'],
    restate: 'a crop of a surface that is already visible in the reference, with at least fifteen percent recognisable context, nothing invented',
  },
  '05-scene': {
    slotId: '05-scene',
    budget: 'P3',
    styleChannel: 'lighting+set',
    reservesCopyArea: false,
    task: 'one realistic in-use scene image showing {{name}} exactly as sold, placed in the environment where it is actually consumed',
    framing: '35-50mm equivalent environmental mid shot, {{cameraAngle}}, shallow depth of field, the product in the near plane and fully sharp, the environment falling softly out of focus',
    surface: '{{sceneSurface}} with a coherent real environment behind it. Generic unbranded props only',
    light: 'natural directional daylight or a warm practical consistent with the environment, soft shadows',
    mayCreate: 'the entire environment, supporting surface, furniture, light, depth of field and generic unbranded props. Never a second unit, another brand, a gift box, a bonus item or an accessory that is not sold',
    slotNegatives: ['gift item', 'free bonus', 'sample sachet', 'bundled accessory', 'second product not sold', 'other branded packaging', 'competitor logo', 'gift box', 'ribbon', 'shelf talker', 'storefront sign', 'delivery app interface'],
    restate: 'only the product that is actually sold appears, the environment is invented but the product is not',
  },
  '06-specification': {
    slotId: '06-specification',
    budget: 'P1',
    styleChannel: 'lighting',
    reservesCopyArea: true,
    task: 'one clean image of {{name}} turned so that {{specFace}} faces the lens, sitting to the right of an empty area that a specification panel will later cover',
    framing: 'orthographic eye-level view, azimuth 0 degrees, tilt 0-5 degrees, 85-100mm equivalent, the complete product in frame',
    surface: 'plain light seamless background. The reserved area on the left must stay low-detail and light, brighter than RGB 235, with no texture, gradient or shadow falling into it',
    light: 'flat even illumination with no hotspot; the printed small text does not need to be made more legible than it is in the reference',
    mayCreate: 'background, supporting surface, lighting, and the small orientation adjustment that brings the specification face to the lens',
    slotNegatives: ['dimension line', 'measurement arrow', 'ruler', 'callout', 'spec table', 'chart', 'certification badge', 'energy label', 'invented capacity marking', 'redrawn specification text', 'dark background', 'textured background'],
    restate: 'the whole product sits inside the stated bounding box on the right, no measurement graphic and no added marking of any kind',
  },
  '07-detail-page': {
    slotId: '07-detail-page',
    budget: 'P2',
    styleChannel: 'lighting+set',
    reservesCopyArea: false,
    task: 'one hero banner image of {{name}} that will sit at the top of a long detail page',
    framing: 'front hero mid shot, eye level to 10 degrees above, 70-85mm equivalent, the complete product in frame and never cropped at the top or bottom',
    surface: 'a calm light background lighter than RGB 240, plain or very softly graded, that a Chinese caption block will sit beneath',
    light: 'soft even commercial light, no hard cast shadow reaching the frame edge',
    mayCreate: 'background, supporting surface, lighting, camera height and distance',
    slotNegatives: ['reserved empty copy area', 'text block', 'headline bar', 'divider line', 'icon row', 'parameter table', 'comparison chart', 'collage', 'stacked panels', 'product cropped at top or bottom', 'second product'],
    restate: 'a single clean hero shot with no layout of its own, every caption and divider is added later outside this image',
  },
  '08-special': {
    slotId: '08-special',
    budget: 'P2',
    styleChannel: 'lighting',
    reservesCopyArea: false,
    task: 'one gift-package image of {{name}} showing the real outer package together with the product inside',
    framing: 'three-quarter view of the package exactly as sold, azimuth 10-20 degrees, camera raised 10-15 degrees, 70-85mm equivalent, both the package and the product complete in frame and uncropped',
    surface: 'plain light neutral seamless surface with a soft contact shadow. No decorative set dressing of any kind',
    light: 'soft key from upper left with right fill and one controlled raking highlight on foil or embossed print; no coloured gel and no atmospheric haze',
    mayCreate: 'background, surface, lighting, camera position, and the relative placement of package and product only',
    slotNegatives: ['invented gift box', 'added ribbon', 'added bow', 'wrapping paper', 'greeting card', 'gift bag', 'accessory not uploaded', 'altered box print', 'unit count changed'],
    restate: 'use only the package and the product visible in the references, invent no box, no ribbon, no bag and no card, and do not change the unit count',
  },
}

export interface RetailPromptContext {
  name: string
  facts: string
  safeBox: RetailSafeBox
  /** 锁定主体清单，来自已确认字段 */
  lockedList: string
  /** 打光通道；场景位额外拿到道具通道 */
  styleLighting: string
  styleSet: string
  /** 类目方向，必须是英文；没有就留空 */
  categoryDirection: string
  /** 件数子句，解析不出件数时是保守措辞 */
  unitClause: string
  unitRestate: string
  rotationCap: string
  detailTarget: string
  cameraAngle: string
  sceneSurface: string
  specFace: string
  /** 用户逐位或全局的补充要求 */
  slotOverride: string
  negatives: string[]
}

function fill(template: string, context: RetailPromptContext) {
  return template
    .replace(/\{\{name\}\}/g, context.name)
    .replace(/\{\{rotationCap\}\}/g, context.rotationCap)
    .replace(/\{\{detailTarget\}\}/g, context.detailTarget)
    .replace(/\{\{cameraAngle\}\}/g, context.cameraAngle)
    .replace(/\{\{sceneSurface\}\}/g, context.sceneSurface)
    .replace(/\{\{specFace\}\}/g, context.specFace)
}

/**
 * 渲染成固定顺序的标签块，一行一约束。
 * 块序是刻意的：RESTATE 在最后吃近因效应，AVOID 倒数第二，用户覆盖插在 AVOID 之前——
 * 绝不能排在硬约束之后，否则一句「加条丝带」就能压过白底守卫。
 */
export function renderRetailSlotPrompt(recipe: RetailSlotRecipe, context: RetailPromptContext): string {
  const style = recipe.styleChannel === 'lighting+set'
    ? [context.styleLighting, context.styleSet].filter(Boolean).join(' ')
    : context.styleLighting
  const { safeBox } = context
  const lines: Array<string | null> = [
    `TASK: ${fill(recipe.task, context)}.`,
    `SUBJECT: [image 1] IS the physical product. Reproduce it, do not reinvent it. ${context.unitClause}`,
    `FACTS (for your verification only, never render any of this as text): ${context.facts}.`,
    context.categoryDirection ? `DIRECTION: ${context.categoryDirection}` : null,
    `FRAMING: ${fill(recipe.framing, context)}.`,
    `LAYOUT: the product bounding box spans x ${safeBox.x0}%-${safeBox.x1}% and y ${safeBox.y0}%-${safeBox.y1}% of the frame.`,
    recipe.reservesCopyArea
      ? `RESERVED: everything left of x ${safeBox.staticZoneRight}% stays empty, low-detail and lighter than RGB 235. No part of the product, no prop and no shadow enters it.`
      : null,
    `SURFACE: ${fill(recipe.surface, context)}.`,
    style ? `LIGHT: ${style} ${fill(recipe.light, context)}.` : `LIGHT: ${fill(recipe.light, context)}.`,
    `KEEP EXACTLY from [image 1]: ${context.lockedList}. ${PRINTED_PIXELS_RULE}`,
    `MAY CREATE: ${fill(recipe.mayCreate, context)}.`,
    `OUT OF FRAME: ${RETAIL_OUT_OF_FRAME.join(', ')}.`,
    context.slotOverride ? `NOTE: ${context.slotOverride}` : null,
    `AVOID: ${context.negatives.join(', ')}.`,
    `RESTATE: ${fill(recipe.restate, context)}, and the product bounding box stays inside x ${safeBox.x0}%-${safeBox.x1}% and y ${safeBox.y0}%-${safeBox.y1}%.`,
  ]
  return lines.filter((line): line is string => Boolean(line)).join('\n')
}

const CJK_PATTERN = /[㐀-䶿一-鿿豈-﫿　-〿＀-￯]/

/**
 * prompt 必须是纯 ASCII 英文。英文指令里夹中文会显著拉低服从度，
 * 而中文的类目建议、审核规则本来就只是给人看的。
 */
export function containsCjk(value: string) {
  return CJK_PATTERN.test(value)
}
