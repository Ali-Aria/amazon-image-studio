export interface RetailUnitCount {
  /** 解析不出来时为 null，绝不猜 */
  count: number | null
  unitNoun: string
  reason: string
}

const UNIT_NOUNS: Record<string, string> = {
  罐: 'can',
  瓶: 'bottle',
  盒: 'box',
  袋: 'bag',
  包: 'pack',
  个: 'piece',
  件: 'piece',
  只: 'piece',
  支: 'stick',
  条: 'strip',
  片: 'piece',
  块: 'piece',
  枚: 'piece',
  卷: 'roll',
  桶: 'bucket',
  箱: 'case',
  提: 'pack',
  组: 'set',
  套: 'set',
  双: 'pair',
  对: 'pair',
  杯: 'cup',
  份: 'portion',
  斤: 'portion',
  克: 'portion',
}

/** 这些措辞的件数天然不确定，猜错会让模型画出不存在的赠品或组合 */
const AMBIGUOUS = /买[一二三四五1-9]\s*送|组合装|混合装|随机|多规格|任选|超值装(?!\s*\d)/

const MULTIPLIER = /[×x✕*]\s*(\d{1,3})\s*([一-鿿]?)/
const SUFFIX_COUNT = /(\d{1,3})\s*(入|连包|(?:瓶|罐|袋|包|盒|个|支|只|片|条|块|枚|卷)装)/
const COUNT_PER_PACK = /(\d{1,3})\s*([一-鿿])\s*[\/／]/
const SINGLE_MEASURE = /^\s*\d+(?:\.\d+)?\s*(?:ml|l|g|kg|mg|毫升|升|克|千克|毫克)\s*[\/／]\s*([一-鿿])\s*$/i

/**
 * 规格里紧挨着数字的那个量词优先于售卖单位：
 * 「500ml×15瓶/箱」售卖单位是箱，但被数的是 15 个**瓶**，
 * 取成 case 会让 prompt 变成「恰好 15 箱」，直接指示模型画错数量级。
 */
export function retailUnitNoun(saleUnit: string, preferredChar = ''): string {
  const preferred = preferredChar.trim().slice(0, 1)
  if (preferred && UNIT_NOUNS[preferred]) return UNIT_NOUNS[preferred]
  const key = saleUnit.trim().slice(0, 1)
  return UNIT_NOUNS[key] ?? 'unit'
}

/**
 * 从售卖规格与售卖单位推断件数，**fail-closed**：任何含糊的写法一律返回 null。
 * 猜错的代价是不对称的——把 500ml×15瓶/箱 当成单瓶会让模型压掉 14 件，
 * 把「买一送一」当成 2 件会让模型画出一个并不存在的赠品，两者都直接撞数量红线。
 */
export function parseRetailUnitCount(saleSpecification: string, saleUnit: string): RetailUnitCount {
  const spec = saleSpecification.trim()
  const unitNoun = retailUnitNoun(saleUnit)

  if (!spec) return { count: null, unitNoun, reason: '未填写售卖规格' }
  if (AMBIGUOUS.test(spec)) return { count: null, unitNoun, reason: '规格含组合或赠品措辞，件数不确定' }

  const multiplier = spec.match(MULTIPLIER)
  if (multiplier) {
    const count = Number(multiplier[1])
    if (count > 0) return { count, unitNoun: retailUnitNoun(saleUnit, multiplier[2]), reason: '规格含乘号件数' }
  }

  const suffix = spec.match(SUFFIX_COUNT)
  if (suffix) {
    const count = Number(suffix[1])
    if (count > 0) return { count, unitNoun: retailUnitNoun(saleUnit, suffix[2].slice(0, 1)), reason: '规格含件数后缀' }
  }

  const perPack = spec.match(COUNT_PER_PACK)
  if (perPack) {
    const count = Number(perPack[1])
    if (count > 0) return { count, unitNoun: retailUnitNoun(saleUnit, perPack[2]), reason: '规格含每包件数' }
  }

  const single = spec.match(SINGLE_MEASURE)
  if (single) return { count: 1, unitNoun: retailUnitNoun(saleUnit, single[1]), reason: '规格是单件计量' }

  return { count: null, unitNoun, reason: '规格无法确定件数' }
}

export function buildRetailUnitClause(parsed: RetailUnitCount) {
  if (parsed.count === null) {
    return {
      clause: 'Keep exactly the same number of units as in the reference; do not add or remove any unit.',
      restate: 'the same number of units as the reference',
      negatives: [] as string[],
    }
  }
  if (parsed.count === 1) {
    return {
      clause: `There is exactly 1 ${parsed.unitNoun} in this product.`,
      restate: `exactly one ${parsed.unitNoun}`,
      negatives: ['second unit', 'duplicate product'],
    }
  }
  // 不写「全部可见」：整箱收缩膜包装本来就只露出前排，硬要求全露会逼模型重排包装
  return {
    clause: `This product is a multipack of exactly ${parsed.count} ${parsed.unitNoun}s; do not reduce or increase the number of units shown.`,
    restate: `a multipack of exactly ${parsed.count} ${parsed.unitNoun}s`,
    negatives: ['fewer units than the reference', 'repackaged as a single unit'],
  }
}
