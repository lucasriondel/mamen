import { Link, useNavigate } from '@tanstack/react-router'
import { LayoutDashboard, Receipt, Store, CreditCard, Settings, Inbox } from 'lucide-react'
import { db, useLiveQuery } from '@/lib/db'
import { useFocusMode } from '@/context/FocusModeContext'
import { useUnmatchedCount } from '@/hooks/useUnmatchedCount'
import { cn } from '@/lib/utils'

type NavItem = {
  to: string
  label: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: '/transactions', label: 'Transactions', icon: <Receipt className="h-4 w-4" /> },
  { to: '/merchants', label: 'Merchants', icon: <Store className="h-4 w-4" /> },
  { to: '/accounts', label: 'Accounts', icon: <CreditCard className="h-4 w-4" /> },
  { to: '/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
]

export function Sidebar(): React.ReactElement {
  const { count: unmatchedCount } = useUnmatchedCount()
  const { focusMode, toggleFocusMode, setFocusMode } = useFocusMode()
  const navigate = useNavigate()

  const merchantCount = useLiveQuery(
    () => db.merchants.count()
  ) ?? 0

  const accountCount = useLiveQuery(
    () => db.accounts.count()
  ) ?? 0

  const handleTransactionsClick = (): void => {
    setFocusMode('all')
  }

  const handleUnmatchedClick = (): void => {
    toggleFocusMode('unmatched')
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
            activeOptions={{ exact: item.to === '/' }}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}

        <button
          onClick={handleUnmatchedClick}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors w-full text-left',
            focusMode === 'unmatched' && 'bg-accent text-foreground',
          )}
          aria-label={`Unmatched transactions: ${unmatchedCount}`}
        >
          <Inbox className="h-4 w-4" />
          <span>Unmatched</span>
          {unmatchedCount > 0 && (
            <span
              className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500"
              aria-hidden="true"
            >
              {unmatchedCount}
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
            <span aria-live="polite">{unmatchedCount}</span>
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
