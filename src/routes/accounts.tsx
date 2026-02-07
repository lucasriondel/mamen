import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/accounts')({
  component: AccountsPage,
})

function AccountsPage(): React.ReactElement {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Accounts</h2>
      <p className="text-muted-foreground">Account management will be implemented in Epic 2.</p>
    </div>
  )
}
