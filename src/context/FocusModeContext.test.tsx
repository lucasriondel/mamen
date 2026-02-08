import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FocusModeProvider, useFocusMode } from './FocusModeContext'

const TestConsumer = (): React.ReactElement => {
  const { focusMode, setFocusMode, toggleFocusMode } = useFocusMode()
  return (
    <div>
      <span data-testid="mode">{focusMode}</span>
      <button onClick={() => toggleFocusMode('unmatched')}>Toggle Unmatched</button>
      <button onClick={() => toggleFocusMode('month')}>Toggle Month</button>
      <button onClick={() => setFocusMode('all')}>Set All</button>
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

  it('toggleFocusMode with different mode switches to that mode', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
      </FocusModeProvider>,
    )

    await user.click(screen.getByText('Toggle Unmatched'))
    expect(screen.getByTestId('mode')).toHaveTextContent('unmatched')

    await user.click(screen.getByText('Toggle Month'))
    expect(screen.getByTestId('mode')).toHaveTextContent('month')
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

  it('U key does not trigger when in input field', async () => {
    const user = userEvent.setup()
    render(
      <FocusModeProvider>
        <TestConsumer />
        <input data-testid="text-input" />
      </FocusModeProvider>,
    )

    const input = screen.getByTestId('text-input')
    await user.click(input)
    await user.keyboard('u')

    expect(screen.getByTestId('mode')).toHaveTextContent('all')
  })

  it('throws error when used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TestConsumer />)).toThrow(
      'useFocusMode must be used within FocusModeProvider',
    )
    spy.mockRestore()
  })
})
