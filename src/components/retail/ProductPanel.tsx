import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, ScanBarcode, Search } from 'lucide-react'
import type {
  RetailArchetype,
  RetailCategoryKnowledge,
  RetailProduct,
  RetailValidationIssue,
} from '../../types'
import { searchRetailCategories, type RetailKnowledgeIndex } from '../../lib/retailKnowledge'
import {
  applyRetailCatalogRecord,
  loadRetailCatalogMeta,
  lookupRetailCatalogProduct,
  normalizeRetailBarcode,
  type RetailCatalogRecord,
} from '../../lib/retailCatalog'

interface ProductPanelProps {
  product: RetailProduct
  archetype: RetailArchetype
  category: RetailCategoryKnowledge | null
  knowledge: RetailKnowledgeIndex | null
  issues: RetailValidationIssue[]
  disabled?: boolean
  onChange: (product: RetailProduct) => void
}

const CORE_ATTRIBUTE_LABELS = new Set([
  '商品名称', '品牌', '售卖规格', '售卖单位', '净含量', '净含量或尺寸', '包装形态', '包装方式',
  '口味', '口味或香型', '储存方式', '贮存方式', '保质期', '配料', '材质', '包装清单', '使用方法', '适用人群',
])

type CatalogLookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'hit'; record: RetailCatalogRecord; filled: string[]; skipped: string[] }
  | { status: 'miss' }
  | { status: 'unavailable' }

export default function ProductPanel({ product, archetype, category, knowledge, issues, disabled, onChange }: ProductPanelProps) {
  const [categoryFocused, setCategoryFocused] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [catalogReady, setCatalogReady] = useState<boolean | null>(null)
  const [lookup, setLookup] = useState<CatalogLookupState>({ status: 'idle' })
  const productRef = useRef(product)
  const setField = <K extends keyof RetailProduct>(field: K, value: RetailProduct[K]) => onChange({ ...product, [field]: value })

  useEffect(() => { productRef.current = product }, [product])
  useEffect(() => {
    let cancelled = false
    void loadRetailCatalogMeta().then((meta) => { if (!cancelled) setCatalogReady(Boolean(meta)) })
    return () => { cancelled = true }
  }, [])

  const runCatalogLookup = async (rawBarcode: string) => {
    const barcode = normalizeRetailBarcode(rawBarcode)
    if (barcode.length < 6) return
    if (catalogReady === false) {
      setLookup({ status: 'unavailable' })
      return
    }
    setLookup({ status: 'loading' })
    const record = await lookupRetailCatalogProduct(barcode)
    if (normalizeRetailBarcode(productRef.current.barcode) !== barcode) return
    if (!record) {
      setLookup({ status: 'miss' })
      return
    }
    const result = applyRetailCatalogRecord(productRef.current, record, productRef.current.platform)
    setLookup({ status: 'hit', record, filled: result.filled, skipped: result.skipped })
    if (result.filled.length > 0) onChange(result.product)
  }

  // 扫码枪一次性打完整串，输入停下来再查，避免每敲一位都去拉分片
  useEffect(() => {
    const barcode = normalizeRetailBarcode(product.barcode)
    if (disabled || catalogReady !== true || barcode.length < 8) return
    const timer = window.setTimeout(() => { void runCatalogLookup(barcode) }, 400)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.barcode, catalogReady, disabled])

  const suggestions = useMemo(() => {
    if (!knowledge || !categoryFocused) return []
    return searchRetailCategories(knowledge, product.platform, product.categoryPath, 10)
  }, [categoryFocused, knowledge, product.categoryPath, product.platform])

  const dynamicAttributes = useMemo(() => {
    const labels = [...archetype.required_facts, ...(category?.attribute_keys ?? [])]
    return [...new Set(labels)].filter((label) => !CORE_ATTRIBUTE_LABELS.has(label)).slice(0, showAdvanced ? 16 : 7)
  }, [archetype.required_facts, category?.attribute_keys, showAdvanced])

  const errorFields = new Set(issues.filter((issue) => issue.severity === 'error').map((issue) => issue.field))
  const requires = (...labels: string[]) => labels.some((label) => archetype.required_facts.includes(label))

  return (
    <section className="retail-section retail-product-fields" aria-labelledby="product-data-title">
      <div className="retail-section-heading">
        <div>
          <span className="retail-step-number">02</span>
          <h2 id="product-data-title">商品资料</h2>
        </div>
        {issues.filter((issue) => issue.severity === 'error').length > 0 && (
          <span className="retail-error-count"><AlertCircle size={13} /> {issues.filter((issue) => issue.severity === 'error').length}</span>
        )}
      </div>

      <div className="retail-catalog-lookup">
        <label className="retail-field">
          <span>条码</span>
          <div className="retail-input-icon">
            <ScanBarcode size={15} />
            <input
              value={product.barcode}
              disabled={disabled}
              inputMode="numeric"
              placeholder={catalogReady === false ? '本地未生成主档索引' : '扫码或输入条码，自动带出主档资料'}
              onChange={(event) => setField('barcode', event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void runCatalogLookup(product.barcode) }}
            />
          </div>
        </label>
        <button
          type="button"
          className="retail-catalog-button"
          disabled={disabled || lookup.status === 'loading' || normalizeRetailBarcode(product.barcode).length < 6}
          onClick={() => void runCatalogLookup(product.barcode)}
        >
          {lookup.status === 'loading' ? '查询中' : '带出主档'}
        </button>
      </div>

      {lookup.status === 'hit' && (
        <p className="retail-catalog-note is-hit">
          已匹配主档：{lookup.record.name}
          {lookup.filled.length > 0 ? ` · 带出 ${lookup.filled.length} 项（${lookup.filled.slice(0, 4).join('、')}${lookup.filled.length > 4 ? '…' : ''}）` : ' · 无空缺字段可带出'}
          {lookup.skipped.length > 0 ? ` · 已填写的 ${lookup.skipped.length} 项保留原值未覆盖` : ''}
          {` · 主档现有主图 ${lookup.record.mainImageCount} 张、详情图 ${lookup.record.detailImageCount} 张、特殊图 ${lookup.record.specialImageCount} 张`}
        </p>
      )}
      {lookup.status === 'miss' && <p className="retail-catalog-note">主档里没有这个条码，请手动补齐商品资料。</p>}
      {lookup.status === 'unavailable' && (
        <p className="retail-catalog-note">本地未生成主档索引，条码带出已关闭。运行 scripts/build_retail_product_index.py 后刷新即可启用。</p>
      )}

      <label className={`retail-field ${errorFields.has('name') ? 'has-error' : ''}`}>
        <span>商品名称 *</span>
        <input value={product.name} disabled={disabled} onChange={(event) => setField('name', event.target.value)} placeholder="包装上的完整商品名" />
      </label>

      <div className="retail-field retail-category-field">
        <span>平台类目 *</span>
        <div className="retail-input-icon">
          <Search size={15} />
          <input
            value={product.categoryPath}
            disabled={disabled}
            onFocus={() => setCategoryFocused(true)}
            onBlur={() => window.setTimeout(() => setCategoryFocused(false), 140)}
            onChange={(event) => setField('categoryPath', event.target.value)}
            placeholder="搜索或输入类目"
          />
        </div>
        {suggestions.length > 0 && (
          <div className="retail-category-menu">
            {suggestions.map((item) => (
              <button key={item.path} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
                setField('categoryPath', item.path)
                setCategoryFocused(false)
              }}>
                <span>{item.path}</span>
                <small>{item.count.toLocaleString()} 条</small>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="retail-field-grid">
        <label className={`retail-field ${errorFields.has('brand') ? 'has-error' : ''}`}>
          <span>品牌 *</span>
          <input value={product.brand} disabled={disabled} onChange={(event) => setField('brand', event.target.value)} />
        </label>
        <label className={`retail-field ${errorFields.has('identity') ? 'has-error' : ''}`}>
          <span>货号 / SKU *</span>
          <input value={product.sku} disabled={disabled} onChange={(event) => setField('sku', event.target.value)} placeholder="店内码，批量包用它做文件名前缀" />
        </label>
      </div>

      {(requires('口味', '口味或香型') || product.flavor) && (
        <label className={`retail-field ${errorFields.has('attributes.口味或香型') || errorFields.has('attributes.口味') ? 'has-error' : ''}`}>
          <span>口味/香型{requires('口味', '口味或香型') ? ' *' : ''}</span>
          <input value={product.flavor} disabled={disabled} onChange={(event) => setField('flavor', event.target.value)} />
        </label>
      )}

      {(requires('储存方式', '贮存方式') || product.storage) && (
        <label className={`retail-field ${errorFields.has('attributes.储存方式') || errorFields.has('attributes.贮存方式') ? 'has-error' : ''}`}>
          <span>储存方式{requires('储存方式', '贮存方式') ? ' *' : ''}</span>
          <input value={product.storage} disabled={disabled} onChange={(event) => setField('storage', event.target.value)} />
        </label>
      )}

      {(requires('保质期') || product.shelfLife) && (
        <label className={`retail-field ${errorFields.has('attributes.保质期') ? 'has-error' : ''}`}>
          <span>保质期{requires('保质期') ? ' *' : ''}</span>
          <input value={product.shelfLife} disabled={disabled} onChange={(event) => setField('shelfLife', event.target.value)} />
        </label>
      )}

      {(requires('配料') || product.ingredients) && (
        <label className={`retail-field ${errorFields.has('attributes.配料') ? 'has-error' : ''}`}>
          <span>配料{requires('配料') ? ' *' : ''}</span>
          <input value={product.ingredients} disabled={disabled} onChange={(event) => setField('ingredients', event.target.value)} />
        </label>
      )}

      {(requires('材质') || product.material) && (
        <label className={`retail-field ${errorFields.has('attributes.材质') ? 'has-error' : ''}`}>
          <span>材质{requires('材质') ? ' *' : ''}</span>
          <input value={product.material} disabled={disabled} onChange={(event) => setField('material', event.target.value)} />
        </label>
      )}

      <div className="retail-field-grid">
        <label className={`retail-field ${errorFields.has('saleSpecification') ? 'has-error' : ''}`}>
          <span>售卖规格 *</span>
          <input value={product.saleSpecification} disabled={disabled} onChange={(event) => setField('saleSpecification', event.target.value)} placeholder="如 330ml/罐" />
        </label>
        <label className={`retail-field ${errorFields.has('saleUnit') ? 'has-error' : ''}`}>
          <span>售卖单位 *</span>
          <input value={product.saleUnit} disabled={disabled} onChange={(event) => setField('saleUnit', event.target.value)} placeholder="罐、瓶、盒" />
        </label>
      </div>

      <div className="retail-field-grid">
        <label className={`retail-field ${errorFields.has('netContent') ? 'has-error' : ''}`}>
          <span>净含量/尺寸 *</span>
          <input value={product.netContent} disabled={disabled} onChange={(event) => setField('netContent', event.target.value)} />
        </label>
        <label className={`retail-field ${errorFields.has('packageForm') ? 'has-error' : ''}`}>
          <span>包装形态 *</span>
          <input value={product.packageForm} disabled={disabled} onChange={(event) => setField('packageForm', event.target.value)} placeholder="易拉罐、袋装" />
        </label>
      </div>

      {dynamicAttributes.map((label) => (
        <label className={`retail-field ${errorFields.has(`attributes.${label}`) ? 'has-error' : ''}`} key={label}>
          <span>{label}{archetype.required_facts.includes(label) ? ' *' : ''}</span>
          <input
            value={product.attributes[label] ?? ''}
            disabled={disabled}
            onChange={(event) => setField('attributes', { ...product.attributes, [label]: event.target.value })}
          />
        </label>
      ))}

      <label className="retail-field">
        <span>核心卖点</span>
        <textarea
          rows={3}
          value={product.sellingPoints.join('\n')}
          disabled={disabled}
          onChange={(event) => setField('sellingPoints', event.target.value.split('\n').map((value) => value.trim()).filter(Boolean).slice(0, 5))}
          placeholder="每行一个已确认卖点"
        />
      </label>

      <button type="button" className="retail-advanced-toggle" onClick={() => setShowAdvanced((value) => !value)}>
        更多商品信息
        <ChevronDown size={15} className={showAdvanced ? 'is-open' : ''} />
      </button>

      {showAdvanced && (
        <div className="retail-advanced-fields">
          <div className="retail-field-grid">
            {!requires('口味', '口味或香型') && <label className="retail-field"><span>口味/香型</span><input value={product.flavor} disabled={disabled} onChange={(event) => setField('flavor', event.target.value)} /></label>}
            {!requires('保质期') && <label className="retail-field"><span>保质期</span><input value={product.shelfLife} disabled={disabled} onChange={(event) => setField('shelfLife', event.target.value)} /></label>}
          </div>
          {!requires('储存方式', '贮存方式') && <label className="retail-field"><span>储存方式</span><input value={product.storage} disabled={disabled} onChange={(event) => setField('storage', event.target.value)} /></label>}
          {!requires('配料') && !requires('材质') && <label className="retail-field"><span>配料/材质</span><input value={product.ingredients || product.material} disabled={disabled} onChange={(event) => archetype.id === 'packaged_food' || archetype.id === 'beverage' || archetype.id === 'alcohol' ? setField('ingredients', event.target.value) : setField('material', event.target.value)} /></label>}
          <label className="retail-field"><span>包装清单</span><input value={product.packageIncludes} disabled={disabled} onChange={(event) => setField('packageIncludes', event.target.value)} /></label>
          <label className="retail-field"><span>使用/食用方法</span><textarea rows={2} value={product.usage} disabled={disabled} onChange={(event) => setField('usage', event.target.value)} /></label>
          <label className="retail-field"><span>禁用元素</span><textarea rows={2} value={product.forbidden} disabled={disabled} onChange={(event) => setField('forbidden', event.target.value)} /></label>
          <label className="retail-field"><span>补充生成要求</span><textarea rows={2} value={product.customPrompt} disabled={disabled} onChange={(event) => setField('customPrompt', event.target.value)} /></label>
        </div>
      )}
    </section>
  )
}
