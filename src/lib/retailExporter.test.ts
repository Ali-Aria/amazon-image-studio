import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createRetailProject } from './retailProject'
import { buildRetailExportManifest, buildRetailProjectZip, planRetailBatchUpload, safeRetailFileSegment } from './retailExporter'

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('retail project export', () => {
  it('sanitizes SKU and product names for cross-platform ZIP paths', () => {
    expect(safeRetailFileSegment(' SKU/01:*? ')).toBe('SKU_01')
    expect(safeRetailFileSegment('')).toBe('未命名')
  })

  it('writes seven stable image names and a recovery manifest', () => {
    const project = createRetailProject(100)
    project.product.name = '可口可乐经典汽水'
    project.product.sku = 'COKE-330'
    project.slots = project.slots.map((slot, index) => index < 7 ? {
      ...slot,
      status: 'done',
      outputImageId: `image-${index + 1}`,
    } : slot)
    const images = Object.fromEntries(project.slots.flatMap((slot) => slot.outputImageId ? [[slot.outputImageId, PNG_DATA_URL]] : []))

    const bytes = buildRetailProjectZip({ project, images, qualityReports: {} })
    const files = unzipSync(bytes)
    const paths = Object.keys(files).sort()
    const root = 'COKE-330_可口可乐经典汽水/'

    expect(paths).toEqual(expect.arrayContaining([
      `${root}01_主图.png`,
      `${root}02_商品正面.png`,
      `${root}03_核心卖点.png`,
      `${root}04_商品细节.png`,
      `${root}05_使用场景.png`,
      `${root}06_规格信息.png`,
      `${root}07_详情长图.png`,
      `${root}manifest.json`,
    ]))
    const manifest = JSON.parse(strFromU8(files[`${root}manifest.json`]))
    expect(manifest.product.sku).toBe('COKE-330')
    expect(manifest.slots).toHaveLength(8)
    expect(manifest.exportStatus).toBe('upload-ready')
    expect(paths.some((path) => path.includes('08_特殊图'))).toBe(false)
  })

  it('marks an incomplete set as a draft in the manifest', () => {
    const manifest = buildRetailExportManifest(createRetailProject(100), {})
    expect(manifest.exportStatus).toBe('draft')
  })

  it('falls back to the generated image when a composed image record is unavailable', () => {
    const project = createRetailProject(100)
    project.product.name = '巧克力礼盒'
    project.product.sku = 'GIFT-01'
    project.slots[0] = {
      ...project.slots[0],
      status: 'done',
      outputImageId: 'generated-main',
      composedImageId: 'missing-composed-main',
    }

    const files = unzipSync(buildRetailProjectZip({
      project,
      images: { 'generated-main': PNG_DATA_URL },
      qualityReports: {},
    }))

    expect(files['GIFT-01_巧克力礼盒/01_主图.png']).toBeDefined()
  })

  it('exports a passing special image with its selected Chinese type and traceable manifest data', () => {
    const project = createRetailProject(100)
    project.product.name = '便携电热水壶'
    project.product.sku = 'KETTLE-01'
    project.specialImageType = 'dimension'
    project.sourceImageIds = ['product-a']
    project.sourceImageRoles = { 'product-a': 'product' }
    project.slots = project.slots.map((slot, index) => ({
      ...slot,
      status: 'done',
      outputImageId: `image-${index + 1}`,
    }))
    project.plans = [{
      id: '08-special',
      order: 8,
      label: '平台特殊图',
      objective: '尺寸参数图',
      prompt: '',
      negativePrompt: '',
      composeMode: 'special',
      copyLines: ['产品尺寸｜160×110×220mm', '额定功率｜800W'],
      targetSize: { width: 600, height: 600 },
      generationSize: '1024x1024',
      generationEligible: true,
      processingMode: 'deterministic',
      specialImageType: 'dimension',
      requiredSourceRole: 'product',
    }]
    const images = Object.fromEntries(project.slots.map((slot) => [slot.outputImageId!, PNG_DATA_URL]))
    const qualityReports = {
      '08-special': { status: 'pass' as const, findings: [] },
    }

    const files = unzipSync(buildRetailProjectZip({ project, images, qualityReports }))
    const root = 'KETTLE-01_便携电热水壶/'
    const manifest = JSON.parse(strFromU8(files[`${root}manifest.json`]))

    expect(files[`${root}08_特殊图_尺寸参数图.png`]).toBeDefined()
    expect(manifest.specialImage).toMatchObject({
      preferredType: 'dimension',
      selectedType: 'dimension',
      processingMode: 'deterministic',
      sourceImageRoles: { 'product-a': 'product' },
      trustedFactLabels: ['产品尺寸', '额定功率'],
    })
  })

  it('omits a blocked special image without downgrading a complete base set', () => {
    const project = createRetailProject(100)
    project.product.name = '护理器械'
    project.product.sku = 'CARE-01'
    project.slots = project.slots.map((slot, index) => ({
      ...slot,
      status: 'done',
      outputImageId: `image-${index + 1}`,
    }))
    const images = Object.fromEntries(project.slots.map((slot) => [slot.outputImageId!, PNG_DATA_URL]))
    const qualityReports = {
      '08-special': { status: 'blocked' as const, findings: [{ code: 'document-ai-forbidden', severity: 'block' as const, message: '禁止生成' }] },
    }

    const files = unzipSync(buildRetailProjectZip({ project, images, qualityReports }))
    const root = 'CARE-01_护理器械/'
    const manifest = JSON.parse(strFromU8(files[`${root}manifest.json`]))

    expect(Object.keys(files).some((path) => path.includes('08_特殊图'))).toBe(false)
    expect(manifest.exportStatus).toBe('upload-ready')
  })
})

describe('美团批量上传包', () => {
  function doneProject() {
    const project = createRetailProject(100)
    project.product.name = '可口可乐经典汽水'
    project.product.sku = 'COKE-330'
    project.slots = project.slots.map((slot, index) => index < 7 ? {
      ...slot,
      status: 'done' as const,
      outputImageId: `image-${index + 1}`,
    } : slot)
    return project
  }

  it('按货号前缀生成连续编号，默认从 _1 起', () => {
    const project = doneProject()
    const images = Object.fromEntries(project.slots.flatMap((slot) => slot.outputImageId ? [[slot.outputImageId, PNG_DATA_URL]] : []))
    const files = unzipSync(buildRetailProjectZip({ project, images, qualityReports: {}, layout: 'meituan-batch' }))
    const root = 'COKE-330_可口可乐经典汽水/'

    for (let index = 1; index <= 7; index += 1) {
      expect(Object.keys(files)).toContain(`${root}COKE-330_${index}.png`)
    }
    expect(Object.keys(files)).toContain(`${root}批量导入说明.txt`)
    expect(Object.keys(files).some((path) => path.includes('01_主图'))).toBe(false)
  })

  it('只补附图时从 _2 起且仍然连续', () => {
    const project = doneProject()
    const images = Object.fromEntries(project.slots.flatMap((slot) => slot.outputImageId ? [[slot.outputImageId, PNG_DATA_URL]] : []))
    const files = unzipSync(buildRetailProjectZip({ project, images, qualityReports: {}, layout: 'meituan-batch', batchStartIndex: 2 }))
    const root = 'COKE-330_可口可乐经典汽水/'
    const indexes = Object.keys(files)
      .flatMap((path) => path.match(/COKE-330_(\d+)\.png$/)?.[1] ?? [])
      .map(Number)
      .sort((a, b) => a - b)

    expect(indexes).toEqual([2, 3, 4, 5, 6, 7, 8])
    const manifest = JSON.parse(strFromU8(files[`${root}manifest.json`]))
    expect(manifest.exportLayout).toBe('meituan-batch')
    expect(manifest.batchFiles).toHaveLength(7)
  })

  it('被质检拦下的图片位不占编号，剩下的仍然连号', () => {
    const project = doneProject()
    // 第 4 张没生成出来，跳过它之后编号必须补齐、不能留空号
    project.slots = project.slots.map((slot) => slot.slotId === '04-detail'
      ? { ...slot, status: 'error' as const, outputImageId: null }
      : slot)
    const images = Object.fromEntries(project.slots.flatMap((slot) => slot.outputImageId ? [[slot.outputImageId, PNG_DATA_URL]] : []))
    const files = unzipSync(buildRetailProjectZip({ project, images, qualityReports: {}, layout: 'meituan-batch' }))
    const indexes = Object.keys(files)
      .flatMap((path) => path.match(/COKE-330_(\d+)\.png$/)?.[1] ?? [])
      .map(Number)
      .sort((a, b) => a - b)

    expect(indexes).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('批量包缺货号', () => {
  it('没有货号时拦下来，不拿条码当前缀', () => {
    const project = createRetailProject(100)
    project.product.name = '可口可乐经典汽水'
    project.product.barcode = '6941876270606'
    project.product.sku = ''
    project.slots = project.slots.map((slot, index) => index < 2 ? {
      ...slot,
      status: 'done' as const,
      outputImageId: `image-${index + 1}`,
    } : slot)
    const images = Object.fromEntries(project.slots.flatMap((slot) => slot.outputImageId ? [[slot.outputImageId, PNG_DATA_URL]] : []))

    expect(() => buildRetailProjectZip({ project, images, qualityReports: {}, layout: 'meituan-batch' }))
      .toThrowError(/缺少货号/)
    // 可读命名的包不受影响，仍然可以导出草稿
    expect(() => buildRetailProjectZip({ project, images, qualityReports: {} })).not.toThrow()
  })
})

describe('planRetailBatchUpload', () => {
  it('编号连续且按实际扩展名命名', () => {
    const plan = planRetailBatchUpload({
      slotIds: ['01-main', '03-selling-points', '07-detail-page'],
      merchantCode: 'SD/001',
      startIndex: 2,
      extensionBySlot: { '01-main': 'jpg', '03-selling-points': 'jpg', '07-detail-page': 'jpg' },
    })
    expect(plan.map((entry) => entry.fileName)).toEqual(['SD_001_2.jpg', 'SD_001_3.jpg', 'SD_001_4.jpg'])
    expect(plan.map((entry) => entry.index)).toEqual([2, 3, 4])
  })
})
