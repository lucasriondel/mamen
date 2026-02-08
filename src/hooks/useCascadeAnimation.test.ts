import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCascadeAnimation } from './useCascadeAnimation'

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}))

import { useReducedMotion } from '@/hooks/useReducedMotion'

describe('useCascadeAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(useReducedMotion).mockReturnValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should start in idle state', () => {
    const { result } = renderHook(() => useCascadeAnimation())
    expect(result.current.isAnimating).toBe(false)
    expect(result.current.animatingIds).toEqual([])
    expect(result.current.animationPhase).toBe('idle')
  })

  it('should transition to highlight phase on trigger', () => {
    const { result } = renderHook(() => useCascadeAnimation())

    act(() => {
      result.current.triggerCascade(['1', '2', '3'])
    })

    expect(result.current.isAnimating).toBe(true)
    expect(result.current.animatingIds).toEqual(['1', '2', '3'])
    expect(result.current.animationPhase).toBe('highlight')
  })

  it('should transition through phases: highlight -> badge -> settle -> idle', () => {
    const { result } = renderHook(() => useCascadeAnimation())

    act(() => {
      result.current.triggerCascade(['1'])
    })
    expect(result.current.animationPhase).toBe('highlight')

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current.animationPhase).toBe('badge')

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.animationPhase).toBe('settle')

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.animationPhase).toBe('idle')
    expect(result.current.isAnimating).toBe(false)
    expect(result.current.animatingIds).toEqual([])
  })

  it('should skip to final state with reduced motion', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    const { result } = renderHook(() => useCascadeAnimation())

    act(() => {
      result.current.triggerCascade(['1', '2'])
    })

    // Should immediately be idle
    expect(result.current.animationPhase).toBe('idle')
    expect(result.current.isAnimating).toBe(false)
  })

  it('should clean up timeouts on unmount', () => {
    const { result, unmount } = renderHook(() => useCascadeAnimation())

    act(() => {
      result.current.triggerCascade(['1'])
    })
    expect(result.current.animationPhase).toBe('highlight')

    unmount()

    // Advancing timers should not cause errors
    act(() => {
      vi.advanceTimersByTime(1000)
    })
  })

  it('should reset animation if triggerCascade called during active animation', () => {
    const { result } = renderHook(() => useCascadeAnimation())

    act(() => {
      result.current.triggerCascade(['1'])
    })
    expect(result.current.animationPhase).toBe('highlight')

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current.animationPhase).toBe('badge')

    // Trigger new cascade
    act(() => {
      result.current.triggerCascade(['4', '5'])
    })
    expect(result.current.animatingIds).toEqual(['4', '5'])
    expect(result.current.animationPhase).toBe('highlight')
  })
})
