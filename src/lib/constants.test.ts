import { describe, it, expect } from 'vitest'
import { APP_VERSION } from './constants'

describe('constants', () => {
  it('APP_VERSION is defined and non-empty', () => {
    expect(APP_VERSION).toBeDefined()
    expect(APP_VERSION.length).toBeGreaterThan(0)
  })
})
