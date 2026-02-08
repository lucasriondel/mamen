import { describe, it, expect, vi } from 'vitest'
import { isMac, getModifierSymbol } from './platform'

describe('platform utils', () => {
  it('isMac returns false in jsdom (Linux-like)', () => {
    expect(isMac()).toBe(false)
  })

  it('getModifierSymbol returns Ctrl+ in non-Mac environment', () => {
    expect(getModifierSymbol()).toBe('Ctrl+')
  })

  it('isMac returns true when navigator.platform contains Mac', () => {
    const originalPlatform = navigator.platform
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
      configurable: true,
    })
    expect(isMac()).toBe(true)
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    })
  })
})
