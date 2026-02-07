import { Link } from '@tanstack/react-router'
import { LayoutDashboard, Receipt, Store, CreditCard } from 'lucide-react'
import { db, useLiveQuery } from '@/lib/db'

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
]

export function Sidebar(): React.ReactElement {
  const unmatched = useLiveQuery(
    () => db.transactions.filter(t => t.merchantId === undefined).count()
  ) ?? 0

  const merchantCount = useLiveQuery(
    () => db.merchants.count()
  ) ?? 0

  const accountCount = useLiveQuery(
    () => db.accounts.count()
  ) ?? 0

  return (
    <aside className="flex flex-col w-[220px] border-r bg-card p-4">
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
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
      </nav>

      <div className="mt-auto pt-4 border-t">
        <p className="text-xs text-muted-foreground px-3 mb-2 font-medium uppercase tracking-wider">
          Stats
        </p>
        <div className="flex flex-col gap-1 px-3 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Unmatched</span>
            <span>{unmatched}</span>
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
