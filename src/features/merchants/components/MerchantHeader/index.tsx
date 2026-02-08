import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CategoryBadge } from '@/components/CategoryBadge'
import { ArrowLeft } from 'lucide-react'

export type MerchantHeaderProps = {
  name: string
  defaultCategoryId: number | undefined
  onBack: () => void
}

export function MerchantHeader({
  name,
  defaultCategoryId,
  onBack,
}: MerchantHeaderProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="gap-1 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Merchants
      </Button>
      <h1 className="text-2xl font-bold">{name}</h1>
      {defaultCategoryId != null ? (
        <CategoryBadge categoryId={defaultCategoryId} size="md" />
      ) : (
        <Badge
          variant="secondary"
          className="gap-1.5 rounded-md h-7 text-sm text-muted-foreground"
        >
          Uncategorized
        </Badge>
      )}
    </div>
  )
}
