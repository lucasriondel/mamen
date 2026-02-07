import { createFileRoute } from '@tanstack/react-router'
import { FileSpreadsheet } from 'lucide-react'
import { db, useLiveQuery } from '@/lib/db'
import { EmptyState } from '@/components/EmptyState'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function DashboardPage(): React.ReactElement {
  const transactionCount = useLiveQuery(
    () => db.transactions.count()
  ) ?? 0

  if (transactionCount === 0) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="No transactions yet"
        description="Import a bank statement to get started tracking your spending."
        actionLabel="Import Statement"
        actionDisabled
      />
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Dashboard</h2>
      <p className="text-muted-foreground">
        {transactionCount} transactions loaded.
      </p>
    </div>
  )
}
