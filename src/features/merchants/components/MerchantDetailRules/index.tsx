import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import type { RuleWithMatchCount } from '../../hooks/useMerchantDetail'

export type MerchantDetailRulesProps = {
  rules: RuleWithMatchCount[]
  onEditRule: (ruleId: number) => void
  onAddRule: () => void
}

export function MerchantDetailRules({
  rules,
  onEditRule,
  onAddRule,
}: MerchantDetailRulesProps): React.ReactElement {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Matching Rules</h2>
        <Button variant="ghost" size="sm" onClick={onAddRule} className="gap-1">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      {rules.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No rules defined</p>
          <Button
            variant="link"
            onClick={onAddRule}
            className="mt-2 gap-1"
          >
            <Plus className="h-4 w-4" />
            Add Rule
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-3 px-3 h-10 group hover:bg-accent/50 transition-colors"
            >
              <code className="font-mono text-sm flex-1 min-w-0 truncate">
                {rule.pattern}
              </code>
              <span className="text-sm text-muted-foreground shrink-0">
                {rule.matchCount} match{rule.matchCount !== 1 ? 'es' : ''}
              </span>
              <span className="text-sm shrink-0">
                {rule.isDefault ? (
                  <span className="text-muted-foreground">(default)</span>
                ) : (
                  <span>→ {rule.categoryLabel}</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2"
                onClick={() => onEditRule(rule.id)}
              >
                Edit
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
