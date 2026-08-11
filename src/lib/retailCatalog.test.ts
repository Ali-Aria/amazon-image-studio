import { describe, expect, it } from 'vitest'
import {
  applyRetailCatalogRecord,
  normalizeRetailBarcode,
  retailCatalogShardKey,
  type RetailCatalogRecord,
} from './retailCatalog'
import { createEmptyRetailProduct } from './retailProduct'

const record: RetailCatalogRecord = {
  barcode: '6941876270606',
  name: '可口可乐经典汽水 330ml',
  brand: '可口可乐',
  saleSpecification: '330ml/罐',
  saleUnit: '罐',
  netContent: '330克(g)',
  mtCategoryPath: '饮料>碳酸饮料>可乐',
  elemeCategoryPath: '酒饮冲调>碳酸饮料',
  attributes: { 口味: '原味', 包装方式: '易拉罐', 产地: '中国' },
  mainImageCount: 6,
  detailImageCount: 1,
  specialImageCount: 2,
  specType: '单规格',
  skuId: '1938069276552749126',
}

describe('条码归一化与分片', () => {
  it('去掉扫码枪带回的空格和回车', () => {
    expect(normalizeRetailBarcode(' 6941876270606\n')).toBe('6941876270606')
  })

  it('分片键取末两位', () => {
    expect(retailCatalogShardKey('6941876270606')).toBe('06')
    expect(retailCatalogShardKey('7')).toBe('07')
  })
})

describe('applyRetailCatalogRecord', () => {
  it('把主档字段填进空位并标记来源为 pool', () => {
    const result = applyRetailCatalogRecord(createEmptyRetailProduct(), record, 'meituan')
    expect(result.product.name).toBe('可口可乐经典汽水 330ml')
    expect(result.product.brand).toBe('可口可乐')
    expect(result.product.saleUnit).toBe('罐')
    expect(result.product.categoryPath).toBe('饮料>碳酸饮料>可乐')
    expect(result.product.flavor).toBe('原味')
    expect(result.product.packageForm).toBe('易拉罐')
    expect(result.product.attributes.产地).toBe('中国')
    expect(result.product.factSources.商品名称).toBe('pool')
    expect(result.product.factSources.产地).toBe('pool')
    expect(result.filled).toContain('商品名称')
  })

  it('淘宝闪购取饿了么类目路径', () => {
    const result = applyRetailCatalogRecord(createEmptyRetailProduct(), record, 'taobao_flash')
    expect(result.product.categoryPath).toBe('酒饮冲调>碳酸饮料')
  })

  it('绝不覆盖已填写的值，只记为跳过', () => {
    const product = { ...createEmptyRetailProduct(), name: '门店自己核对过的名称', brand: '可口可乐' }
    const result = applyRetailCatalogRecord(product, record, 'meituan')
    expect(result.product.name).toBe('门店自己核对过的名称')
    expect(result.skipped).toContain('商品名称')
    // 值相同不算冲突
    expect(result.skipped).not.toContain('品牌')
    expect(result.filled).not.toContain('商品名称')
  })

  it('主档空字段不写入，也不产生来源标记', () => {
    const sparse: RetailCatalogRecord = { ...record, brand: '', attributes: {} }
    const result = applyRetailCatalogRecord(createEmptyRetailProduct(), sparse, 'meituan')
    expect(result.product.brand).toBe('')
    expect(result.product.factSources.品牌).toBeUndefined()
  })
})
