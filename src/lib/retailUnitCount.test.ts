import { describe, expect, it } from 'vitest'
import { buildRetailUnitClause, parseRetailUnitCount } from './retailUnitCount'

describe('parseRetailUnitCount', () => {
  it('单件计量规格判为 1 件', () => {
    expect(parseRetailUnitCount('330ml/罐', '罐')).toMatchObject({ count: 1, unitNoun: 'can' })
    expect(parseRetailUnitCount('500ml/瓶', '瓶')).toMatchObject({ count: 1, unitNoun: 'bottle' })
  })

  it('乘号多件装按真实件数解析', () => {
    // 被数的是「瓶」不是售卖单位「箱」——取成 case 会让件数错一个数量级
    expect(parseRetailUnitCount('500ml×15瓶/箱', '箱')).toMatchObject({ count: 15, unitNoun: 'bottle' })
    expect(parseRetailUnitCount('250ml*24盒', '箱')).toMatchObject({ count: 24, unitNoun: 'box' })
  })

  it('件数后缀与每包件数都能识别', () => {
    expect(parseRetailUnitCount('6入', '包')).toMatchObject({ count: 6 })
    expect(parseRetailUnitCount('12瓶装', '箱')).toMatchObject({ count: 12 })
    expect(parseRetailUnitCount('6罐/提', '提')).toMatchObject({ count: 6 })
  })

  it('含糊措辞一律 fail-closed，绝不猜', () => {
    // 猜成 2 会让模型画出一个并不存在的赠品，直接撞数量红线
    expect(parseRetailUnitCount('买一送一', '瓶').count).toBeNull()
    expect(parseRetailUnitCount('组合装', '盒').count).toBeNull()
    expect(parseRetailUnitCount('混合装随机口味', '袋').count).toBeNull()
    // 型号色号这类根本不是件数的规格
    expect(parseRetailUnitCount('35337A-奶白色', '个').count).toBeNull()
    expect(parseRetailUnitCount('', '个').count).toBeNull()
  })
})

describe('buildRetailUnitClause', () => {
  it('单件时才注入禁止第二件的负面词', () => {
    const single = buildRetailUnitClause({ count: 1, unitNoun: 'can', reason: '' })
    expect(single.clause).toContain('exactly 1 can')
    expect(single.negatives).toContain('duplicate product')
  })

  it('多件装必须移除 duplicate product，否则等于指示模型压掉其余件数', () => {
    const multi = buildRetailUnitClause({ count: 15, unitNoun: 'bottle', reason: '' })
    expect(multi.clause).toContain('multipack of exactly 15 bottles')
    expect(multi.negatives).not.toContain('duplicate product')
    expect(multi.negatives).toContain('repackaged as a single unit')
  })

  it('解析不出件数时改成保守措辞，不下任何数量指令', () => {
    const unknown = buildRetailUnitClause({ count: null, unitNoun: 'unit', reason: '' })
    expect(unknown.clause).toContain('same number of units as in the reference')
    expect(unknown.negatives).toHaveLength(0)
  })
})
