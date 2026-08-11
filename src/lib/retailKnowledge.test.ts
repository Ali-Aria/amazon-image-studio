import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RetailKnowledgeData } from '../types'
import {
  createRetailKnowledgeIndex,
  matchRetailCategory,
  searchRetailCategories,
} from './retailKnowledge'

const knowledge = JSON.parse(
  readFileSync(new URL('../../public/knowledge/retail-category-knowledge.v1.json', import.meta.url), 'utf8'),
) as RetailKnowledgeData

describe('retail category knowledge', () => {
  it('contains the full product-pool coverage for all three platforms', () => {
    expect(knowledge.rows_scanned).toBe(109_441)
    expect(Object.keys(knowledge.archetypes)).toHaveLength(23)
    expect(Object.keys(knowledge.top_level_archetypes.meituan)).toHaveLength(42)
    expect(Object.keys(knowledge.top_level_archetypes.taobao_flash)).toHaveLength(39)
    expect(Object.keys(knowledge.top_level_archetypes.jd)).toHaveLength(46)
    expect(knowledge.categories.meituan).toHaveLength(1_659)
    expect(knowledge.categories.taobao_flash).toHaveLength(1_862)
    expect(knowledge.categories.jd).toHaveLength(2_750)
  })

  it('matches an exact category path and exposes pool-derived attributes', () => {
    const result = matchRetailCategory(
      createRetailKnowledgeIndex(knowledge),
      'meituan',
      '酒类>啤酒>黄啤',
    )

    expect(result.archetype.id).toBe('alcohol')
    expect(result.category?.attribute_keys).toContain('酒精度')
    expect(result.category?.sale_units).toContain('罐')
    expect(result.matchType).toBe('exact')
  })

  it('falls back to a matching top-level category and finally to other', () => {
    const index = createRetailKnowledgeIndex(knowledge)
    const topLevel = matchRetailCategory(index, 'meituan', '酒类>尚未收录的新子类')
    const unknown = matchRetailCategory(index, 'meituan', '完全未知类目')

    expect(topLevel.archetype.id).toBe('alcohol')
    expect(topLevel.matchType).toBe('top-level')
    expect(unknown.archetype.id).toBe('other')
    expect(unknown.matchType).toBe('fallback')
  })

  it('searches paths by normalized partial text and ranks exact prefixes first', () => {
    const results = searchRetailCategories(
      createRetailKnowledgeIndex(knowledge),
      'meituan',
      '啤酒 黄啤',
      8,
    )

    expect(results[0]?.path).toBe('酒类>啤酒>黄啤')
    expect(results.length).toBeGreaterThan(0)
  })
})
