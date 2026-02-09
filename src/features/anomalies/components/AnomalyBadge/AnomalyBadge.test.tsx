import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnomalyBadge } from './index'
import type { AnomalyFlag } from '@/types'

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
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

  it('renders new-merchant badge with correct text', () => {
    render(
      <AnomalyBadge
        flags={[makeFlag({ type: 'new-merchant', reason: 'First seen merchant - Amazon created 5 days ago' })]}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('New merchant')).toBeInTheDocument()
  })

  it('shows correct tooltip reason for new-merchant', () => {
    render(
      <AnomalyBadge
        flags={[makeFlag({ type: 'new-merchant', reason: 'First seen merchant - Amazon created 5 days ago' })]}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByTestId('tooltip-content')).toHaveTextContent(
      'First seen merchant - Amazon created 5 days ago',
    )
  })

  it('renders both badges when transaction has high-amount and new-merchant flags', () => {
    render(
      <AnomalyBadge
        flags={[
          makeFlag({ type: 'high-amount', reason: 'High amount reason' }),
          makeFlag({ type: 'new-merchant', reason: 'First seen merchant - Amazon created 5 days ago' }),
        ]}
        onDismiss={vi.fn()}
      />,
    )

    const badges = screen.getAllByTestId('anomaly-badge')
    expect(badges).toHaveLength(2)
    expect(screen.getByText('Unusual amount')).toBeInTheDocument()
    expect(screen.getByText('New merchant')).toBeInTheDocument()
  })

  it('dismisses new-merchant independently of high-amount', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()

    render(
      <AnomalyBadge
        flags={[
          makeFlag({ type: 'high-amount', reason: 'High' }),
          makeFlag({ type: 'new-merchant', reason: 'New' }),
        ]}
        onDismiss={onDismiss}
      />,
    )

    const badges = screen.getAllByTestId('anomaly-badge')
    // Click the new-merchant badge (second one)
    await user.click(badges[1])
    expect(onDismiss).toHaveBeenCalledWith('new-merchant')
  })
})
