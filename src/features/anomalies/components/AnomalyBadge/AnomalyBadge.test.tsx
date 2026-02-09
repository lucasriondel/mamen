import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnomalyBadge } from './index'
import type { AnomalyFlag } from '@/types'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children, asChild, ...props }: { children: React.ReactNode; asChild?: boolean }) => <span {...props}>{children}</span>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-content">{children}</div>,
}))

const makeFlag = (overrides: Partial<AnomalyFlag> = {}): AnomalyFlag => ({
  type: 'high-amount',
  reason: '400,00 € is 3x your average for Shopping (130,00 €)',
  detectedAt: '2026-02-01T10:00:00.000Z',
  dismissed: false,
  ...overrides,
})

describe('AnomalyBadge', () => {
  it('renders badge for active (non-dismissed) flags', () => {
    render(<AnomalyBadge flags={[makeFlag()]} onDismiss={vi.fn()} />)

    expect(screen.getByTestId('anomaly-badge')).toBeInTheDocument()
    expect(screen.getByText('Unusual amount')).toBeInTheDocument()
  })

  it('does not render when all flags are dismissed', () => {
    const { container } = render(
      <AnomalyBadge flags={[makeFlag({ dismissed: true })]} onDismiss={vi.fn()} />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('does not render when flags array is empty', () => {
    const { container } = render(
      <AnomalyBadge flags={[]} onDismiss={vi.fn()} />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('shows reason string in tooltip', () => {
    render(<AnomalyBadge flags={[makeFlag()]} onDismiss={vi.fn()} />)

    expect(screen.getByTestId('tooltip-content')).toHaveTextContent(
      '400,00 € is 3x your average for Shopping (130,00 €)',
    )
  })

  it('uses warning styling', () => {
    render(<AnomalyBadge flags={[makeFlag()]} onDismiss={vi.fn()} />)

    const badge = screen.getByTestId('anomaly-badge')
    expect(badge.className).toContain('text-amber')
    expect(badge.className).toContain('border-amber')
  })

  it('calls onDismiss with flag type when clicked', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()

    render(<AnomalyBadge flags={[makeFlag()]} onDismiss={onDismiss} />)

    await user.click(screen.getByTestId('anomaly-badge'))
    expect(onDismiss).toHaveBeenCalledWith('high-amount')
  })

  it('has accessible aria-label', () => {
    render(<AnomalyBadge flags={[makeFlag()]} onDismiss={vi.fn()} />)

    expect(screen.getByLabelText('Dismiss anomaly: Unusual amount')).toBeInTheDocument()
  })
})
