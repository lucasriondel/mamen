import { describe, it, expect } from 'vitest'
import { ruleSchema, createRuleSchema } from './rule.schema'

describe('ruleSchema', () => {
  it('validates a valid rule', () => {
    const valid = {
      id: 1,
      merchantId: 1,
      pattern: 'AMAZON\\.COM',
      matchCount: 5,
      createdAt: new Date(),
    }
    expect(ruleSchema.parse(valid)).toEqual(valid)
  })

  it('validates rule with categoryOverride', () => {
    const valid = {
      id: 1,
      merchantId: 1,
      pattern: 'AMZN\\*',
      categoryOverride: 3,
      matchCount: 0,
      createdAt: new Date(),
    }
    expect(ruleSchema.parse(valid)).toEqual(valid)
  })

  it('rejects rule with empty pattern', () => {
    expect(() =>
      ruleSchema.parse({
        merchantId: 1,
        pattern: '',
        matchCount: 0,
        createdAt: new Date(),
      })
    ).toThrow()
  })

  it('rejects rule missing merchantId', () => {
    expect(() =>
      ruleSchema.parse({
        pattern: 'TEST',
        matchCount: 0,
        createdAt: new Date(),
      })
    ).toThrow()
  })
})

describe('createRuleSchema', () => {
  it('validates create input with merchantId and pattern', () => {
    const input = { merchantId: 1, pattern: 'STORE\\s+#\\d+' }
    expect(createRuleSchema.parse(input)).toEqual(input)
  })

  it('validates create input with categoryOverride', () => {
    const input = { merchantId: 1, pattern: 'TEST', categoryOverride: 2 }
    expect(createRuleSchema.parse(input)).toEqual(input)
  })

  it('rejects empty pattern', () => {
    expect(() => createRuleSchema.parse({ merchantId: 1, pattern: '' })).toThrow()
  })
})
