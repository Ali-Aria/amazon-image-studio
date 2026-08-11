import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createRetailProject } from './retailProject'
import { buildRetailExportManifest, buildRetailProjectZip, safeRetailFileSegment } from './retailExporter'

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
    project.slots = project.slots.map((slot, index) => ({
      ...slot,
      status: 'done',
      outputImageId: `image-${index + 1}`,
    }))
    const images = Object.fromEntries(project.slots.map((slot) => [slot.outputImageId!, PNG_DATA_URL]))

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
    expect(manifest.slots).toHaveLength(7)
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
})
