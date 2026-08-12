import { describe, expect, it } from 'vitest'
import { getAppViewFromHash } from './appRoute'

describe('application routes', () => {
  it('routes the repair hash to the dedicated QNH repair workspace', () => {
    expect(getAppViewFromHash('#/repair')).toBe('repair')
    expect(getAppViewFromHash('#/editor')).toBe('editor')
    expect(getAppViewFromHash('#/tagger')).toBe('tagger')
    expect(getAppViewFromHash('#/unknown')).toBe('home')
  })
})
