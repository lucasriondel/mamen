import { createFileRoute } from '@tanstack/react-router'
import { MerchantDetailPage } from '@/features/merchants/components/MerchantDetailPage'

export const Route = createFileRoute('/merchants/$merchantId')({
  component: MerchantDetailRoute,
})

function MerchantDetailRoute(): React.ReactElement {
  const { merchantId } = Route.useParams()

  return <MerchantDetailPage merchantId={Number(merchantId)} />
}
