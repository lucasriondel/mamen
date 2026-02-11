import { Link, useNavigate } from '@tanstack/react-router'
import { LayoutDashboard, Receipt, Store, CreditCard, Settings, Inbox, FileText, CalendarDays, Repeat, Tag } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { merchantsApi, accountsApi, rulesApi, queryKeys } from '@/lib/api'
import { useFocusMode } from '@/context/FocusModeContext'
import { useUnmatchedCount } from '@/hooks/useUnmatchedCount'
import { useCurrentMonthCount } from '@/hooks/useCurrentMonthCount'
import { useSubscriptions } from '@/features/subscriptions/hooks/useSubscriptions'
import { cn } from '@/lib/utils'
import { AnimatedCounter } from '@/components/AnimatedCounter'

type NavItem = {
  to: string
  label: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: '/transactions', label: 'Transactions', icon: <Receipt className="h-4 w-4" /> },
  { to: '/merchants', label: 'Merchants', icon: <Store className="h-4 w-4" /> },
  { to: '/rules', label: 'Rules', icon: <FileText className="h-4 w-4" /> },
  { to: '/categories', label: 'Categories', icon: <Tag className="h-4 w-4" /> },
  { to: '/accounts', label: 'Accounts', icon: <CreditCard className="h-4 w-4" /> },
  { to: '/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
]

export function Sidebar(): React.ReactElement {
  const { count: unmatchedCount } = useUnmatchedCount()
  const monthCount = useCurrentMonthCount()
  const { count: subscriptionCount } = useSubscriptions()
  const { activeFilters, toggleFocusMode, setFocusMode } = useFocusMode()
  const navigate = useNavigate()

  const { data: merchantCount = 0 } = useQuery({
    queryKey: [...queryKeys.merchants.all, 'count'],
    queryFn: () => merchantsApi.getAll().then(m => m.length),
  })

  const { data: accountCount = 0 } = useQuery({
    queryKey: [...queryKeys.accounts.all, 'count'],
    queryFn: () => accountsApi.getAll().then(a => a.length),
  })

  const { data: ruleCount = 0 } = useQuery({
    queryKey: [...queryKeys.rules.all, 'count'],
    queryFn: () => rulesApi.getAll().then(r => r.length),
  })

  const handleTransactionsClick = (): void => {
    setFocusMode('all')
  }

  const handleMonthClick = (): void => {
    toggleFocusMode('month')
    navigate({ to: '/transactions' })
  }

  const handleSubscriptionsClick = (): void => {
    toggleFocusMode('subscriptions')
    navigate({ to: '/transactions' })
  }

  return (
    <aside className="flex flex-col w-[220px] border-r bg-card p-4">
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={item.to === '/transactions' ? handleTransactionsClick : undefined}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            activeProps={{
              className: 'bg-accent text-foreground',
            }}
            activeOptions={{ exact: item.to === '/' || item.to === '/transactions' }}
          >
            {item.icon}
            {item.label}
            {item.to === '/rules' && ruleCount > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">({ruleCount})</span>
            )}
          </Link>
        ))}

        <Link
          to="/transactions/unmatched"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors w-full text-left"
          activeProps={{
            className: 'bg-accent text-foreground',
          }}
          aria-label={`Unmatched transactions: ${unmatchedCount}`}
        >
          <Inbox className="h-4 w-4" />
          <span>Unmatched</span>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-500/20" aria-hidden="true">
            <AnimatedCounter value={unmatchedCount} />
          </span>
        </Link>

        <button
          onClick={handleMonthClick}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors w-full text-left',
            activeFilters.has('month') && 'bg-accent text-foreground',
          )}
          aria-label={`This month transactions: ${monthCount}`}
        >
          <CalendarDays className="h-4 w-4" />
          <span>This Month</span>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-blue-500/20" aria-hidden="true">
            <AnimatedCounter value={monthCount} />
          </span>
        </button>

        <button
          onClick={handleSubscriptionsClick}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors w-full text-left',
            activeFilters.has('subscriptions') && 'bg-accent text-foreground',
          )}
          aria-label={`Subscriptions: ${subscriptionCount}`}
        >
          <Repeat className="h-4 w-4" />
          <span>Subscriptions</span>
          {subscriptionCount > 0 && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-purple-500/20" aria-hidden="true">
              <AnimatedCounter value={subscriptionCount} />
            </span>
          )}
        </button>
      </nav>

      <div className="mt-auto pt-4 border-t">
        <p className="text-xs text-muted-foreground px-3 mb-2 font-medium uppercase tracking-wider">
          Stats
        </p>
        <div className="flex flex-col gap-1 px-3 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Unmatched</span>
            <span aria-live="polite">
              <AnimatedCounter value={unmatchedCount} />
            </span>
          </div>
          <div className="flex justify-between">
            <span>Merchants</span>
            <span>{merchantCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Accounts</span>
            <span>{accountCount}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
