import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FocusModeProvider, useFocusMode } from './FocusModeContext'

const TestConsumer = (): React.ReactElement => {
  const { focusMode, activeFilters, currentMonthRange, setFocusMode, toggleFocusMode } = useFocusMode()
  return (
    <div>
      <span data-testid="mode">{focusMode}</span>
      <span data-testid="filters">{Array.from(activeFilters).sort().join(',') || 'none'}</span>
      <span data-testid="month-start">{currentMonthRange.start.toISOString()}</span>
      <span data-testid="month-end">{currentMonthRange.end.toISOString()}</span>
      <button onClick={() => toggleFocusMode('unmatched')}>Toggle Unmatched</button>
      <button onClick={() => toggleFocusMode('month')}>Toggle Month</button>
      <button onClick={() => toggleFocusMode('all')}>Toggle All</button>
      <button onClick={() => setFocusMode('all')}>Set All</button>
      <input data-testid="text-input" />
    </div>
  )
}

describe('FocusModeContext', () => {
  it('defaults to all mode', () => {
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    expect(screen.getByTestId('mode')).toHaveTextContent('all')
    expect(screen.getByTestId('filters')).toHaveTextContent('none')
  })

  it('toggleFocusMode switches to specified mode', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    await user.click(screen.getByText('Toggle Unmatched'))
    expect(screen.getByTestId('mode')).toHaveTextContent('unmatched')
  })

  it('toggleFocusMode switches back to all when already active', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    await user.click(screen.getByText('Toggle Unmatched'))
    expect(screen.getByTestId('mode')).toHaveTextContent('unmatched')

    await user.click(screen.getByText('Toggle Unmatched'))
    expect(screen.getByTestId('mode')).toHaveTextContent('all')
  })

  it('setFocusMode sets mode directly', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    await user.click(screen.getByText('Toggle Unmatched'))
    expect(screen.getByTestId('mode')).toHaveTextContent('unmatched')

    await user.click(screen.getByText('Set All'))
    expect(screen.getByTestId('mode')).toHaveTextContent('all')
  })

  it('toggleFocusMode(month) adds month to active filters', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    await user.click(screen.getByText('Toggle Month'))
    expect(screen.getByTestId('mode')).toHaveTextContent('month')
    expect(screen.getByTestId('filters')).toHaveTextContent('month')
  })

  it('toggleFocusMode(month) again removes month', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    await user.click(screen.getByText('Toggle Month'))
    expect(screen.getByTestId('filters')).toHaveTextContent('month')

    await user.click(screen.getByText('Toggle Month'))
    expect(screen.getByTestId('filters')).toHaveTextContent('none')
    expect(screen.getByTestId('mode')).toHaveTextContent('all')
  })

  it('toggleFocusMode(all) clears all active filters', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    await user.click(screen.getByText('Toggle Month'))
    await user.click(screen.getByText('Toggle Unmatched'))
    expect(screen.getByTestId('filters')).toHaveTextContent('month,unmatched')

    await user.click(screen.getByText('Toggle All'))
    expect(screen.getByTestId('filters')).toHaveTextContent('none')
    expect(screen.getByTestId('mode')).toHaveTextContent('all')
  })

  it('combined filters: month + unmatched both active simultaneously', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    await user.click(screen.getByText('Toggle Month'))
    await user.click(screen.getByText('Toggle Unmatched'))

    expect(screen.getByTestId('filters')).toHaveTextContent('month,unmatched')
    // unmatched takes priority for backward-compatible focusMode
    expect(screen.getByTestId('mode')).toHaveTextContent('unmatched')
  })

  it('currentMonthRange returns correct start/end dates', () => {
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    const now = new Date()
    const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    const expectedEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    expect(screen.getByTestId('month-start')).toHaveTextContent(expectedStart.toISOString())
    expect(screen.getByTestId('month-end')).toHaveTextContent(expectedEnd.toISOString())
  })

  it('U key toggles unmatched mode', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    expect(screen.getByTestId('mode')).toHaveTextContent('all')

    await user.keyboard('u')
    expect(screen.getByTestId('mode')).toHaveTextContent('unmatched')

    await user.keyboard('u')
    expect(screen.getByTestId('mode')).toHaveTextContent('all')
  })

  it('M key toggles month mode', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    expect(screen.getByTestId('mode')).toHaveTextContent('all')

    await user.keyboard('m')
    expect(screen.getByTestId('mode')).toHaveTextContent('month')
    expect(screen.getByTestId('filters')).toHaveTextContent('month')

    await user.keyboard('m')
    expect(screen.getByTestId('mode')).toHaveTextContent('all')
    expect(screen.getByTestId('filters')).toHaveTextContent('none')
  })

  it('A key clears all active filters', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    await user.keyboard('m')
    await user.keyboard('u')
    expect(screen.getByTestId('filters')).toHaveTextContent('month,unmatched')

    await user.keyboard('a')
    expect(screen.getByTestId('filters')).toHaveTextContent('none')
    expect(screen.getByTestId('mode')).toHaveTextContent('all')
  })

  it('M + U combines via keyboard: shows both active', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    await user.keyboard('m')
    expect(screen.getByTestId('filters')).toHaveTextContent('month')

    await user.keyboard('u')
    expect(screen.getByTestId('filters')).toHaveTextContent('month,unmatched')
  })

  it('U key does not trigger when in input field', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    const input = screen.getByTestId('text-input')
    await user.click(input)
    await user.keyboard('u')

    expect(screen.getByTestId('mode')).toHaveTextContent('all')
  })

  it('M key does not trigger when in input field', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    const input = screen.getByTestId('text-input')
    await user.click(input)
    await user.keyboard('m')

    expect(screen.getByTestId('mode')).toHaveTextContent('all')
  })

  it('S key toggles subscriptions mode', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    expect(screen.getByTestId('mode')).toHaveTextContent('all')

    await user.keyboard('s')
    expect(screen.getByTestId('mode')).toHaveTextContent('subscriptions')
    expect(screen.getByTestId('filters')).toHaveTextContent('subscriptions')

    await user.keyboard('s')
    expect(screen.getByTestId('mode')).toHaveTextContent('all')
    expect(screen.getByTestId('filters')).toHaveTextContent('none')
  })

  it('A key clears subscriptions filter', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    await user.keyboard('s')
    expect(screen.getByTestId('filters')).toHaveTextContent('subscriptions')

    await user.keyboard('a')
    expect(screen.getByTestId('filters')).toHaveTextContent('none')
    expect(screen.getByTestId('mode')).toHaveTextContent('all')
  })

  it('S key does not trigger when in input field', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    const input = screen.getByTestId('text-input')
    await user.click(input)
    await user.keyboard('s')

    expect(screen.getByTestId('mode')).toHaveTextContent('all')
  })

  it('S + M combined: shows both active', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    await user.keyboard('s')
    expect(screen.getByTestId('filters')).toHaveTextContent('subscriptions')

    await user.keyboard('m')
    expect(screen.getByTestId('filters')).toHaveTextContent('month,subscriptions')
  })

  it('throws error when used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TestConsumer />)).toThrow(
      'useFocusMode must be used within FocusModeProvider',
    )
    spy.mockRestore()
  })
})
