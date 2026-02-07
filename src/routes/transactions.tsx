import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/transactions')({
  component: TransactionsPage,
})

function TransactionsPage(): React.ReactElement {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Transactions</h2>
      <p className="text-muted-foreground">Transaction list will be implemented in Epic 3.</p>
    </div>
  )
}
