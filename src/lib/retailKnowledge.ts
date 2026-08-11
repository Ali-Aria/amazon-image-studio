import type {
  RetailArchetype,
  RetailArchetypeId,
  RetailCategoryKnowledge,
  RetailKnowledgeData,
  RetailPlatformId,
} from '../types'

export interface RetailKnowledgeIndex {
  data: RetailKnowledgeData
  categoryMaps: Record<RetailPlatformId, Map<string, RetailCategoryKnowledge>>
}

export interface RetailCategoryMatch {
  category: RetailCategoryKnowledge | null
  archetype: RetailArchetype
  matchType: 'exact' | 'top-level' | 'fallback'
}

function normalizeCategoryText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[／/\\|]+/g, '>')
    .replace(/\s*>​?\s*/g, '>')
    .replace(/\s+/g, '')
    .trim()
}

function getArchetype(data: RetailKnowledgeData, id: RetailArchetypeId): RetailArchetype {
  const source = data.archetypes[id] ?? data.archetypes.other
  return { id, ...source }
}

export function createRetailKnowledgeIndex(data: RetailKnowledgeData): RetailKnowledgeIndex {
  const createMap = (platform: RetailPlatformId) => new Map(
    data.categories[platform].map((category) => [normalizeCategoryText(category.path), category]),
  )

  return {
    data,
    categoryMaps: {
      meituan: createMap('meituan'),
      taobao_flash: createMap('taobao_flash'),
      jd: createMap('jd'),
    },
  }
}

export function matchRetailCategory(
  index: RetailKnowledgeIndex,
  platform: RetailPlatformId,
  path: string,
): RetailCategoryMatch {
  const normalized = normalizeCategoryText(path)
  const exact = index.categoryMaps[platform].get(normalized) ?? null
  if (exact) {
    return {
      category: exact,
      archetype: getArchetype(index.data, exact.archetype),
      matchType: 'exact',
    }
  }

  const topLevel = path.trim().split(/[>／/\\|]/)[0]?.trim() ?? ''
  const topLevelEntry = Object.entries(index.data.top_level_archetypes[platform]).find(
    ([name]) => normalizeCategoryText(name) === normalizeCategoryText(topLevel),
  )
  if (topLevelEntry) {
    return {
      category: null,
      archetype: getArchetype(index.data, topLevelEntry[1]),
      matchType: 'top-level',
    }
  }

  return {
    category: null,
    archetype: getArchetype(index.data, 'other'),
    matchType: 'fallback',
  }
}

export function searchRetailCategories(
  index: RetailKnowledgeIndex,
  platform: RetailPlatformId,
  query: string,
  limit = 20,
): RetailCategoryKnowledge[] {
  const terms = query
    .normalize('NFKC')
    .toLowerCase()
    .split(/[\s>／/\\|]+/)
    .map((term) => term.trim())
    .filter(Boolean)

  const categories = index.data.categories[platform]
  if (terms.length === 0) return categories.slice(0, limit)

  return categories
    .map((category) => {
      const normalized = normalizeCategoryText(category.path)
      if (!terms.every((term) => normalized.includes(normalizeCategoryText(term)))) return null
      const leaf = normalizeCategoryText(category.path.split('>').at(-1) ?? '')
      const score = terms.reduce((sum, term) => {
        const normalizedTerm = normalizeCategoryText(term)
        return sum + (leaf === normalizedTerm ? 200 : leaf.includes(normalizedTerm) ? 80 : 20)
      }, 0) + Math.log10(Math.max(1, category.count))
      return { category, score }
    })
    .filter((entry): entry is { category: RetailCategoryKnowledge; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score || b.category.count - a.category.count)
    .slice(0, limit)
    .map((entry) => entry.category)
}

let cachedKnowledge: Promise<RetailKnowledgeIndex> | null = null

export function loadRetailKnowledge(): Promise<RetailKnowledgeIndex> {
  if (!cachedKnowledge) {
    const base = import.meta.env.BASE_URL || './'
    cachedKnowledge = fetch(`${base}knowledge/retail-category-knowledge.v1.json`)
      .then((response) => {
        if (!response.ok) throw new Error('类目知识库加载失败')
        return response.json() as Promise<RetailKnowledgeData>
      })
      .then(createRetailKnowledgeIndex)
      .catch((error) => {
        cachedKnowledge = null
        throw error
      })
  }
  return cachedKnowledge
}
