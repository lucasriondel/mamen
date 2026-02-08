import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/merchants/$merchantId')({
  component: MerchantDetailPage,
})

function MerchantDetailPage(): React.ReactElement {
  const { merchantId } = Route.useParams()

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Merchant Detail</h2>
      <p className="text-muted-foreground">
        Merchant #{merchantId} — Detail view coming in Story 7.2
      </p>
    </div>
  )
}
