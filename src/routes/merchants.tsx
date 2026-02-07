import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/merchants')({
  component: MerchantsPage,
})

function MerchantsPage(): React.ReactElement {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Merchants</h2>
      <p className="text-muted-foreground">Merchant management will be implemented in Epic 7.</p>
    </div>
  )
}
