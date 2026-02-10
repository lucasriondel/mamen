import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { isNewMerchant } from '../../utils/isNewMerchant'

type NewMerchantBadgeProps = {
  createdAt: Date
  size?: 'sm' | 'default'
}

export const NewMerchantBadge = ({ createdAt, size = 'default' }: NewMerchantBadgeProps) => {
  if (!isNewMerchant(createdAt)) return null
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-blue-500/50 bg-blue-500/10 text-blue-500',
        size === 'sm' && 'text-[10px] px-1 py-0',
      )}
    >
      New
    </Badge>
  )
}
