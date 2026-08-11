import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildRetailBatchZip, groupRetailBatchFiles, parseBarcodeFromFileName } from './retailBatch'
import { createRetailProject } from './retailProject'

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function file(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' })
}

describe('parseBarcodeFromFileName', () => {
  it('识别纯条码文件名', () => {
    expect(parseBarcodeFromFileName('6941876270606.jpg')).toBe('6941876270606')
  })

  it('识别带序号和中文后缀的文件名', () => {
    expect(parseBarcodeFromFileName('6941876270606_2.png')).toBe('6941876270606')
    expect(parseBarcodeFromFileName('6941876270606-正面.jpeg')).toBe('6941876270606')
  })

  it('不足 6 位或没有条码时返回 null', () => {
    expect(parseBarcodeFromFileName('主图.jpg')).toBeNull()
    expect(parseBarcodeFromFileName('12345.jpg')).toBeNull()
  })
})

describe('groupRetailBatchFiles', () => {
  it('同条码多图归到一个商品，识别不出的单独列出', () => {
    const result = groupRetailBatchFiles([
      file('6941876270606_2.jpg'),
      file('6941876270606.jpg'),
      file('6902538001068.jpg'),
      file('随手拍.jpg'),
    ])

    expect(result.groups).toHaveLength(2)
    const cola = result.groups.find((group) => group.barcode === '6941876270606')
    expect(cola?.files.map((item) => item.name)).toEqual(['6941876270606.jpg', '6941876270606_2.jpg'])
    expect(result.unmatched.map((item) => item.name)).toEqual(['随手拍.jpg'])
  })
})

describe('buildRetailBatchZip', () => {
  function projectWithImages(sku: string, name: string) {
    const project = createRetailProject(100)
    project.product.sku = sku
    project.product.name = name
    project.slots = project.slots.map((slot, index) => index < 2 ? {
      ...slot,
      status: 'done' as const,
      outputImageId: `${sku}-image-${index + 1}`,
    } : slot)
    const images = Object.fromEntries(project.slots.flatMap((slot) => slot.outputImageId ? [[slot.outputImageId, PNG_DATA_URL]] : []))
    return { project, images, qualityReports: {} }
  }

  it('每个商品一个子目录，并附总清单', () => {
    const bytes = buildRetailBatchZip(
      [projectWithImages('SKU-A', '可乐'), projectWithImages('SKU-B', '雪碧')],
      'meituan-batch',
      2,
    )
    const files = unzipSync(bytes)
    const paths = Object.keys(files)

    expect(paths).toContain('SKU-A_可乐/SKU-A_2.png')
    expect(paths).toContain('SKU-A_可乐/SKU-A_3.png')
    expect(paths).toContain('SKU-B_雪碧/SKU-B_2.png')
    expect(paths).toContain('批量导出清单.json')

    const summary = JSON.parse(strFromU8(files['批量导出清单.json']))
    expect(summary.productCount).toBe(2)
    expect(summary.batchStartIndex).toBe(2)
    expect(summary.products.map((item: { sku: string }) => item.sku)).toEqual(['SKU-A', 'SKU-B'])
  })

  it('同货号同名的商品不会互相覆盖', () => {
    const bytes = buildRetailBatchZip(
      [projectWithImages('SKU-A', '可乐'), projectWithImages('SKU-A', '可乐')],
      'readable',
    )
    const roots = new Set(Object.keys(unzipSync(bytes)).map((path) => path.split('/')[0]))
    expect(roots.size).toBe(3)
  })
})
