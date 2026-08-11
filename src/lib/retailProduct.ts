import type {
  RetailArchetype,
  RetailProduct,
  RetailValidationIssue,
} from '../types'

export function createEmptyRetailProduct(): RetailProduct {
  return {
    name: '',
    platform: 'meituan',
    categoryPath: '',
    archetypeId: 'other',
    brand: '',
    sku: '',
    barcode: '',
    saleSpecification: '',
    saleUnit: '',
    netContent: '',
    packageForm: '',
    flavor: '',
    storage: '',
    shelfLife: '',
    ingredients: '',
    material: '',
    packageIncludes: '',
    usage: '',
    audience: '',
    description: '',
    sellingPoints: [],
    attributes: {},
    factSources: {},
    forbidden: '',
    customPrompt: '',
  }
}

const FACT_FIELD_MAP: Record<string, keyof RetailProduct> = {
  商品名称: 'name',
  品牌: 'brand',
  售卖规格: 'saleSpecification',
  售卖单位: 'saleUnit',
  净含量: 'netContent',
  '净含量或尺寸': 'netContent',
  包装形态: 'packageForm',
  包装方式: 'packageForm',
  口味: 'flavor',
  '口味或香型': 'flavor',
  储存方式: 'storage',
  贮存方式: 'storage',
  保质期: 'shelfLife',
  配料: 'ingredients',
  材质: 'material',
  包装清单: 'packageIncludes',
  使用方法: 'usage',
  适用人群: 'audience',
}

function valueForFact(product: RetailProduct, label: string): string {
  const field = FACT_FIELD_MAP[label]
  if (field) {
    const value = product[field]
    return typeof value === 'string' ? value.trim() : ''
  }
  return product.attributes[label]?.trim() ?? ''
}

function issue(field: string, label: string, severity: 'error' | 'warning', code: string, message: string): RetailValidationIssue {
  return { field, label, severity, code, message }
}

export function getConfirmedRetailFacts(product: RetailProduct): Record<string, string> {
  const facts: Record<string, string> = {}
  const pairs: Array<[string, string]> = [
    ['商品名称', product.name],
    ['品牌', product.brand],
    ['平台类目', product.categoryPath],
    ['条码', product.barcode],
    ['SKU', product.sku],
    ['售卖规格', product.saleSpecification],
    ['售卖单位', product.saleUnit],
    ['净含量', product.netContent],
    ['包装形态', product.packageForm],
    ['口味', product.flavor],
    ['储存方式', product.storage],
    ['保质期', product.shelfLife],
    ['配料', product.ingredients],
    ['材质', product.material],
    ['包装清单', product.packageIncludes],
    ['使用方法', product.usage],
    ['适用人群', product.audience],
  ]
  for (const [label, value] of pairs) {
    if (value.trim()) facts[label] = value.trim()
  }
  for (const [label, value] of Object.entries(product.attributes)) {
    if (value.trim()) facts[label] = value.trim()
  }
  return facts
}

export function validateRetailProduct(product: RetailProduct, archetype: RetailArchetype) {
  const errors: RetailValidationIssue[] = []
  const warnings: RetailValidationIssue[] = []
  const requireField = (field: keyof RetailProduct, label: string) => {
    const value = product[field]
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(issue(String(field), label, 'error', 'required', `请补充${label}`))
    }
  }

  requireField('name', '商品名称')
  requireField('categoryPath', '平台类目')
  requireField('brand', '品牌')
  if (!product.sku.trim() && !product.barcode.trim()) {
    errors.push(issue('identity', '条码或 SKU', 'error', 'required', '请至少填写条码或 SKU'))
  }
  requireField('saleSpecification', '售卖规格')
  requireField('saleUnit', '售卖单位')
  requireField('netContent', '净含量或尺寸')
  requireField('packageForm', '包装形态')

  const alreadyRequired = new Set(errors.map((entry) => entry.label))
  for (const label of archetype.required_facts) {
    if (alreadyRequired.has(label) || valueForFact(product, label)) continue
    errors.push(issue(`attributes.${label}`, label, 'error', 'category-required', `${archetype.label}类目需要确认${label}`))
  }

  if (product.sellingPoints.length === 0) {
    warnings.push(issue('sellingPoints', '核心卖点', 'warning', 'missing-selling-points', '未填写已确认卖点，卖点图将只展示商品事实'))
  }
  if (product.description.trim()) {
    warnings.push(issue('description', '商品描述', 'warning', 'unverified-description', '自由描述不会自动转换为销售属性，请在结构化字段中确认'))
  }

  return {
    errors,
    warnings,
    confirmedFacts: getConfirmedRetailFacts(product),
    valid: errors.length === 0,
  }
}
