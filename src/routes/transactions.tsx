import { createFileRoute } from '@tanstack/react-router'
import { TransactionList } from '@/features/transactions'

export const Route = createFileRoute('/transactions')({
  component: TransactionsPage,
})

function TransactionsPage(): React.ReactElement {
  return (
    <div className="flex flex-col h-full -m-6">
      <div className="px-6 py-4 border-b">
        <h2 className="text-2xl font-bold">Transactions</h2>
      </div>
      <div className="flex-1 min-h-0">
        <TransactionList />
      </div>
    </div>
  )
}
