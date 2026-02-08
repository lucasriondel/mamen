import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
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

  afterEach(() => {
    vi.useRealTimers()
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

  it('shows "New" badge on new merchants and not on old ones', async () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)

    // Add a new merchant (within 30 days)
    const newM = (await db.merchants.add({
      name: 'NewShop',
      createdAt: new Date('2026-02-01T12:00:00Z'),
      firstSeen: new Date('2026-02-01T12:00:00Z'),
    })) as number

    // Add an old merchant (over 30 days)
    const oldM = (await db.merchants.add({
      name: 'OldShop',
      createdAt: new Date('2025-06-01T12:00:00Z'),
      firstSeen: new Date('2025-06-01T12:00:00Z'),
    })) as number

    await db.transactions.bulkAdd([
      { accountId: 1, date: new Date('2026-02-01'), amount: -50, rawMerchantString: 'NEW', merchantId: newM, importedAt: now, importMonth: '2026-02' },
      { accountId: 1, date: new Date('2026-01-01'), amount: -50, rawMerchantString: 'OLD', merchantId: oldM, importedAt: now, importMonth: '2026-01' },
    ])

    render(<MerchantsList />)

    await screen.findByText('NewShop')
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('filters to show only new merchants when toggle active', async () => {
    const now = new Date()
    const recentDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    const newM = (await db.merchants.add({
      name: 'NewShop',
      createdAt: recentDate,
      firstSeen: recentDate,
    })) as number

    const oldM = (await db.merchants.add({
      name: 'OldShop',
      createdAt: oldDate,
      firstSeen: oldDate,
    })) as number

    await db.transactions.bulkAdd([
      { accountId: 1, date: new Date('2026-02-01'), amount: -50, rawMerchantString: 'NEW', merchantId: newM, importedAt: now, importMonth: '2026-02' },
      { accountId: 1, date: new Date('2026-01-01'), amount: -50, rawMerchantString: 'OLD', merchantId: oldM, importedAt: now, importMonth: '2026-01' },
    ])

    const user = userEvent.setup()
    render(<MerchantsList />)

    await screen.findByText('NewShop')
    expect(screen.getByText('OldShop')).toBeInTheDocument()

    // Toggle "New only"
    const newOnlyBtn = screen.getByRole('button', { name: 'New only' })
    await user.click(newOnlyBtn)

    expect(screen.getByText('NewShop')).toBeInTheDocument()
    expect(screen.queryByText('OldShop')).not.toBeInTheDocument()
    expect(screen.getByText(/1 of 2 merchants \(new only\)/)).toBeInTheDocument()
  })

  it('combines "New only" filter with search query', async () => {
    const now = new Date()
    const recentDate1 = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    const recentDate2 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
    const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    const m1 = (await db.merchants.add({
      name: 'NewAlpha',
      createdAt: recentDate1,
      firstSeen: recentDate1,
    })) as number

    const m2 = (await db.merchants.add({
      name: 'NewBeta',
      createdAt: recentDate2,
      firstSeen: recentDate2,
    })) as number

    const m3 = (await db.merchants.add({
      name: 'OldAlpha',
      createdAt: oldDate,
      firstSeen: oldDate,
    })) as number

    await db.transactions.bulkAdd([
      { accountId: 1, date: new Date('2026-02-01'), amount: -10, rawMerchantString: 'NA', merchantId: m1, importedAt: now, importMonth: '2026-02' },
      { accountId: 1, date: new Date('2026-02-02'), amount: -10, rawMerchantString: 'NB', merchantId: m2, importedAt: now, importMonth: '2026-02' },
      { accountId: 1, date: new Date('2025-01-01'), amount: -10, rawMerchantString: 'OA', merchantId: m3, importedAt: now, importMonth: '2025-01' },
    ])

    const user = userEvent.setup()
    render(<MerchantsList />)

    await screen.findByText('NewAlpha')

    // Toggle "New only"
    await user.click(screen.getByRole('button', { name: 'New only' }))

    // Search for "Alpha"
    const searchInput = screen.getByPlaceholderText('Filter merchants...')
    await user.type(searchInput, 'Alpha')

    // Only NewAlpha should match (new + search)
    expect(screen.getByText('NewAlpha')).toBeInTheDocument()
    expect(screen.queryByText('NewBeta')).not.toBeInTheDocument()
    expect(screen.queryByText('OldAlpha')).not.toBeInTheDocument()
  })

  it('toggle off restores full list', async () => {
    const now = new Date()
    const recentDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    const newM = (await db.merchants.add({
      name: 'NewShop',
      createdAt: recentDate,
      firstSeen: recentDate,
    })) as number

    const oldM = (await db.merchants.add({
      name: 'OldShop',
      createdAt: oldDate,
      firstSeen: oldDate,
    })) as number

    await db.transactions.bulkAdd([
      { accountId: 1, date: new Date('2026-02-01'), amount: -50, rawMerchantString: 'NEW', merchantId: newM, importedAt: now, importMonth: '2026-02' },
      { accountId: 1, date: new Date('2026-01-01'), amount: -50, rawMerchantString: 'OLD', merchantId: oldM, importedAt: now, importMonth: '2026-01' },
    ])

    const user = userEvent.setup()
    render(<MerchantsList />)

    await screen.findByText('NewShop')

    const newOnlyBtn = screen.getByRole('button', { name: 'New only' })
    await user.click(newOnlyBtn) // on
    expect(screen.queryByText('OldShop')).not.toBeInTheDocument()

    await user.click(newOnlyBtn) // off
    expect(screen.getByText('OldShop')).toBeInTheDocument()
    expect(screen.getByText('NewShop')).toBeInTheDocument()
  })
})
