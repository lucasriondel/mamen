import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NewMerchantBadge } from './index'

describe('NewMerchantBadge', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders "New" badge when createdAt is within 30 days', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    const createdAt = new Date('2026-02-01T12:00:00Z')
    render(<NewMerchantBadge createdAt={createdAt} />)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('renders nothing when createdAt is older than 30 days', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    const createdAt = new Date('2025-12-01T12:00:00Z')
    const { container } = render(<NewMerchantBadge createdAt={createdAt} />)
    expect(container.innerHTML).toBe('')
  })

  it('applies small size class when size="sm"', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    const createdAt = new Date('2026-02-01T12:00:00Z')
    render(<NewMerchantBadge createdAt={createdAt} size="sm" />)
    const badge = screen.getByText('New')
    expect(badge.className).toContain('text-[10px]')
  })

  it('has accessible text content "New"', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    const createdAt = new Date('2026-02-01T12:00:00Z')
    render(<NewMerchantBadge createdAt={createdAt} />)
    expect(screen.getByText('New')).toHaveTextContent('New')
  })
})
