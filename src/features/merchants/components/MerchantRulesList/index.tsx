import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { useCategories } from '@/hooks/useCategories'

type MerchantRulesListProps = {
  merchantId: number
}

export function MerchantRulesList({
  merchantId,
}: MerchantRulesListProps): React.ReactElement {
  const rules = useLiveQuery(
    () => db.rules.where('merchantId').equals(merchantId).toArray(),
    [merchantId],
    [],
  )

  const { getCategoryById } = useCategories()

  if (rules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No existing rules
      </p>
    )
  }

  return (
    <ul role="list" className="space-y-1">
      {rules.map((rule) => {
        const overrideCategory = rule.categoryOverride
          ? getCategoryById(rule.categoryOverride)
          : null

        return (
          <li
            key={rule.id}
            role="listitem"
            className="flex items-center gap-2 text-sm py-1"
          >
            <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
              {rule.pattern}
            </code>
            <span className="text-muted-foreground">
              ({rule.matchCount} matches)
            </span>
            {overrideCategory ? (
              <span className="text-muted-foreground">
                &rarr; {overrideCategory.name}
              </span>
            ) : (
              <span className="text-muted-foreground">(default)</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
