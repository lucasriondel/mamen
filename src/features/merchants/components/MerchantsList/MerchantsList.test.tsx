import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/lib/db'
import { MerchantsList } from './index'

// Mock navigate
const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

beforeAll(() => {
  // jsdom lacks ResizeObserver
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // jsdom lacks scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
  // jsdom lacks hasPointerCapture (needed by Radix Select)
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

  const m3 = (await db.merchants.add({
    name: 'Spotify',
    createdAt: now,
    firstSeen: now,
  })) as number

  // Amazon: 3 txns, €300 total
  await db.transactions.bulkAdd([
    { accountId: 1, date: new Date('2026-01-01'), amount: -100, rawMerchantString: 'AMZN', merchantId: m1, importedAt: now, importMonth: '2026-01' },
    { accountId: 1, date: new Date('2026-01-02'), amount: -100, rawMerchantString: 'AMZN', merchantId: m1, importedAt: now, importMonth: '2026-01' },
    { accountId: 1, date: new Date('2026-01-03'), amount: -100, rawMerchantString: 'AMZN', merchantId: m1, importedAt: now, importMonth: '2026-01' },
  ])

  // Netflix: 1 txn, €15
  await db.transactions.add({
    accountId: 1, date: new Date('2026-01-05'), amount: -15, rawMerchantString: 'NFLX', merchantId: m2, importedAt: now, importMonth: '2026-01',
  })

  // Spotify: 2 txns, €20
  await db.transactions.bulkAdd([
    { accountId: 1, date: new Date('2026-01-10'), amount: -10, rawMerchantString: 'SPTFY', merchantId: m3, importedAt: now, importMonth: '2026-01' },
    { accountId: 1, date: new Date('2026-01-11'), amount: -10, rawMerchantString: 'SPTFY', merchantId: m3, importedAt: now, importMonth: '2026-01' },
  ])

  // Seed a category for Amazon
  await db.categories.add({
    name: 'Shopping',
    slug: 'shopping',
    color: '#3B82F6',
    icon: 'ShoppingCart',
    parentId: null,
    sortOrder: 0,
    createdAt: now,
  })

  return { m1, m2, m3 }
}

describe('MerchantsList', () => {
  beforeEach(async () => {
    await db.merchants.clear()
    await db.transactions.clear()
    await db.categories.clear()
    navigateMock.mockClear()
  })

  it('renders list of merchants', async () => {
    await seedData()

    render(<MerchantsList />)

    expect(await screen.findByText('Amazon')).toBeInTheDocument()
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText('Spotify')).toBeInTheDocument()
  })

  it('shows merchant count', async () => {
    await seedData()

    render(<MerchantsList />)

    expect(await screen.findByText('3 merchants')).toBeInTheDocument()
  })

  it('filters merchants when search query changes', async () => {
    await seedData()
    const user = userEvent.setup()

    render(<MerchantsList />)

    expect(await screen.findByText('Amazon')).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText('Filter merchants...')
    await user.type(searchInput, 'net')

    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.queryByText('Amazon')).not.toBeInTheDocument()
    expect(screen.queryByText('Spotify')).not.toBeInTheDocument()
  })

  it('shows filtered count when searching', async () => {
    await seedData()
    const user = userEvent.setup()

    render(<MerchantsList />)

    await screen.findByText('3 merchants')

    const searchInput = screen.getByPlaceholderText('Filter merchants...')
    await user.type(searchInput, 'net')

    expect(await screen.findByText('1 of 3 merchants')).toBeInTheDocument()
  })

  it('sorts merchants when sort option changes', async () => {
    await seedData()
    const user = userEvent.setup()

    render(<MerchantsList />)

    // Default sort: totalSpent desc — Amazon (300), Spotify (20), Netflix (15)
    const rows = await screen.findAllByRole('button', { name: /View .* details/ })
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveAttribute('aria-label', 'View Amazon details')

    // Change sort to Name
    const sortTrigger = screen.getByRole('combobox')
    await user.click(sortTrigger)
    const nameOption = await screen.findByRole('option', { name: 'Name' })
    await user.click(nameOption)

    // After name sort (asc): Amazon, Netflix, Spotify
    const sortedRows = screen.getAllByRole('button', { name: /View .* details/ })
    expect(sortedRows[0]).toHaveAttribute('aria-label', 'View Amazon details')
    expect(sortedRows[1]).toHaveAttribute('aria-label', 'View Netflix details')
    expect(sortedRows[2]).toHaveAttribute('aria-label', 'View Spotify details')
  })

  it('shows empty state when no merchants', async () => {
    render(<MerchantsList />)

    expect(await screen.findByText('No merchants yet')).toBeInTheDocument()
    expect(
      screen.getByText(/Merchants are created when you assign transactions/),
    ).toBeInTheDocument()
  })

  it('shows no-results state when search has no matches', async () => {
    await seedData()
    const user = userEvent.setup()

    render(<MerchantsList />)

    await screen.findByText('Amazon')

    const searchInput = screen.getByPlaceholderText('Filter merchants...')
    await user.type(searchInput, 'zzzzz')

    expect(await screen.findByText(/No merchants matching/)).toBeInTheDocument()
  })
})
