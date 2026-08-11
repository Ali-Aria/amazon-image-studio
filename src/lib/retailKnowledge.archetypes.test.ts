import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RetailKnowledgeData } from '../types'
import { validateRetailArchetypes } from './retailKnowledge'
import { RETAIL_SLOT_IDS } from './retailPlanner'

const data = JSON.parse(
  readFileSync(new URL('../../public/knowledge/retail-category-knowledge.v1.json', import.meta.url), 'utf8'),
) as RetailKnowledgeData

const archetypes = Object.entries(data.archetypes) as Array<[string, Record<string, unknown>]>

describe('类目原型的方向与受控名词', () => {
  it('23 个原型全部按 slotId 键控，8 个位一个不缺', () => {
    expect(archetypes).toHaveLength(23)
    expect(validateRetailArchetypes(data, RETAIL_SLOT_IDS)).toEqual([])
  })

  it('进模型的英文方向必须纯 ASCII', () => {
    for (const [id, archetype] of archetypes) {
      const directions = archetype.slot_directions as Record<string, { en: string; zh: string }>
      for (const slotId of RETAIL_SLOT_IDS) {
        expect(directions[slotId].en, `${id}/${slotId}`).toMatch(/^[\x20-\x7E]+$/)
        expect(directions[slotId].zh.trim().length, `${id}/${slotId}`).toBeGreaterThan(0)
      }
    }
  })

  it('场景位不许混进组合、礼赠、数量、清单这类别的位的内容', () => {
    for (const [id, archetype] of archetypes) {
      const scene = (archetype.slot_directions as Record<string, { zh: string; en: string }>)['05-scene']
      // 旧的 slot_plan 里 alcohol/beverage/electronics/stationery_toys/adult_products/jewelry_eyewear
      // 六个原型正是在这一位落进了「礼赠或组合展示」「包装清单」「隐私包装说明」
      expect(scene.zh, `${id}/05-scene.zh`).not.toMatch(/组合|礼赠|礼盒|赠品|包装清单|隐私/)
      expect(scene.en.toLowerCase(), `${id}/05-scene.en`).not.toMatch(/gift box|bundle|package contents|privacy pack/)
    }
  })

  it('细节特写目标不许是微缩文字表面', () => {
    for (const [id, archetype] of archetypes) {
      const targets = (archetype.subject_rules as { detail_targets: string[] }).detail_targets
      expect(targets.length, id).toBeGreaterThanOrEqual(2)
      for (const target of targets) {
        // 配料表、营养成分、认证标一旦被模型重绘，就从「画得丑」升级成「伪造合规信息」
        // 「避开批号与生产日期」这类排除从句是更强的安全声明，先剥掉再判
        const bare = target.toLowerCase().replace(/\b(clear of|away from|excluding|without|outside|never showing)\b[\s\S]*$/, '')
        expect(bare, `${id}: ${target}`).not.toMatch(/ingredient list|nutrition|certification mark|barcode|expiry/)
      }
    }
  })

  it('每个原型都给出了 02/06 要转向镜头的印刷面与 05 的承托面', () => {
    for (const [id, archetype] of archetypes) {
      const rules = archetype.subject_rules as {
        text_surfaces: string[]
        scene_surfaces: string[]
        camera_angle_en: string
        rotation_cap_en: string
      }
      expect(rules.text_surfaces.length, id).toBeGreaterThan(0)
      expect(rules.scene_surfaces.length, id).toBeGreaterThan(0)
      expect(rules.camera_angle_en, id).toMatch(/^[\x20-\x7E]+$/)
      expect(rules.rotation_cap_en, id).toMatch(/^[\x20-\x7E]+$/)
    }
  })

  it('保留旧的 slot_plan 只为回溯，不再有代码按下标消费它', () => {
    for (const [id, archetype] of archetypes) {
      expect(Array.isArray(archetype.slot_plan), id).toBe(true)
    }
  })
})
