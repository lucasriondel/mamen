import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/lib/db'
import { MerchantsPage } from './index'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})

const seedData = async () => {
  const now = new Date()
  const m1 = (await db.merchants.add({
    name: 'Amazon',
    defaultCategoryId: 1,
    createdAt: now,
    firstSeen: now,
  })) as number

  const m2 = (await db.merchants.add({
    name: 'Netflix',
    createdAt: now,
    firstSeen: now,
  })) as number

  await db.transactions.bulkAdd([
    { accountId: 1, date: new Date('2026-01-01'), amount: -200, rawMerchantString: 'AMZN', merchantId: m1, importedAt: now, importMonth: '2026-01' },
    { accountId: 1, date: new Date('2026-01-05'), amount: -15, rawMerchantString: 'NFLX', merchantId: m2, importedAt: now, importMonth: '2026-01' },
  ])

  return { m1, m2 }
}

describe('MerchantsPage (integration)', () => {
  beforeEach(async () => {
    await db.merchants.clear()
    await db.transactions.clear()
    await db.categories.clear()
    navigateMock.mockClear()
  })

  it('renders full page with header, merchant list, and keyboard hints', async () => {
    await seedData()

    render(<MerchantsPage />)

    expect(screen.getByText('Merchants')).toBeInTheDocument()
    expect(await screen.findByText('Amazon')).toBeInTheDocument()
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText(/Navigate/)).toBeInTheDocument()
    expect(screen.getByText(/Open/)).toBeInTheDocument()
  })

  it('keyboard J/K navigates between merchants', async () => {
    await seedData()
    const user = userEvent.setup()

    render(<MerchantsPage />)

    // Wait for merchants to load
    await screen.findByText('Amazon')

    // Focus the list container
    const container = screen.getByText('Amazon').closest('[tabindex="-1"]')!
    container.focus()

    // Press J to focus first merchant (Amazon — highest spent)
    await user.keyboard('j')

    const rows = screen.getAllByRole('button', { name: /View .* details/ })
    expect(rows[0].className).toContain('ring')

    // Press J again to focus second
    await user.keyboard('j')
    expect(rows[1].className).toContain('ring')
    expect(rows[0].className).not.toContain('ring')
  })

  it('Enter on focused merchant navigates to merchant detail', async () => {
    const { m1 } = await seedData()
    const user = userEvent.setup()

    render(<MerchantsPage />)

    await screen.findByText('Amazon')

    const container = screen.getByText('Amazon').closest('[tabindex="-1"]')!
    container.focus()

    // J to focus first, Enter to navigate
    await user.keyboard('j')
    await user.keyboard('{Enter}')

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/merchants/$merchantId',
      params: { merchantId: String(m1) },
    })
  })

  it('search flow: type, filter, clear, restore', async () => {
    await seedData()
    const user = userEvent.setup()

    render(<MerchantsPage />)

    await screen.findByText('Amazon')
    expect(screen.getByText('Netflix')).toBeInTheDocument()

    // Type in search
    const searchInput = screen.getByPlaceholderText('Filter merchants...')
    await user.type(searchInput, 'ama')

    // Only Amazon should show
    expect(screen.getByText('Amazon')).toBeInTheDocument()
    expect(screen.queryByText('Netflix')).not.toBeInTheDocument()

    // Clear search
    await user.clear(searchInput)

    // Both should be back
    expect(await screen.findByText('Amazon')).toBeInTheDocument()
    expect(screen.getByText('Netflix')).toBeInTheDocument()
  })

  it('empty state shows when no merchants exist', async () => {
    render(<MerchantsPage />)

    expect(await screen.findByText('No merchants yet')).toBeInTheDocument()
    expect(screen.getByText('View Transactions')).toBeInTheDocument()
  })

  it('empty state CTA navigates to transactions', async () => {
    const user = userEvent.setup()

    render(<MerchantsPage />)

    const cta = await screen.findByText('View Transactions')
    await user.click(cta)

    expect(navigateMock).toHaveBeenCalledWith({ to: '/transactions' })
  })
})
