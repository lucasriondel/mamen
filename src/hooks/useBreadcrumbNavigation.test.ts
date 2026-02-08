import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBreadcrumbNavigation } from './useBreadcrumbNavigation'

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: vi.fn(),
}))

import { useLocation } from '@tanstack/react-router'

const mockUseLocation = vi.mocked(useLocation)

function mockLocation(pathname: string): void {
  mockUseLocation.mockReturnValue({
    pathname,
    search: {},
    hash: '',
    href: pathname,
    searchStr: '',
    state: {} as never,
    maskedLocation: undefined,
  } as ReturnType<typeof useLocation>)
}

describe('useBreadcrumbNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('navigates up on Backspace when on nested route', () => {
    mockLocation('/merchants/123')
    renderHook(() => useBreadcrumbNavigation())

    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
    document.dispatchEvent(event)

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/merchants' })
  })

  it('does not navigate on Backspace when on root route', () => {
    mockLocation('/')
    renderHook(() => useBreadcrumbNavigation())

    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
    document.dispatchEvent(event)

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not navigate on Backspace when on single-segment route', () => {
    mockLocation('/transactions')
    renderHook(() => useBreadcrumbNavigation())

    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
    document.dispatchEvent(event)

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not navigate when input is focused', () => {
    mockLocation('/merchants/123')
    renderHook(() => useBreadcrumbNavigation())

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
    Object.defineProperty(event, 'target', { value: input })
    document.dispatchEvent(event)

    expect(mockNavigate).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('does not navigate when textarea is focused', () => {
    mockLocation('/merchants/123')
    renderHook(() => useBreadcrumbNavigation())

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()

    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
    Object.defineProperty(event, 'target', { value: textarea })
    document.dispatchEvent(event)

    expect(mockNavigate).not.toHaveBeenCalled()
    document.body.removeChild(textarea)
  })

  it('ignores non-Backspace keys', () => {
    mockLocation('/merchants/123')
    renderHook(() => useBreadcrumbNavigation())

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    document.dispatchEvent(event)

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
