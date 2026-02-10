import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import type { PatternSuggestion } from '@/features/rules/services/ruleEngine'

type PatternSuggestionRadioGroupProps = {
  suggestions: PatternSuggestion[]
  value: string
  onChange: (pattern: string) => void
  onCustomMode: () => void
}

export function PatternSuggestionRadioGroup({
  suggestions,
  value,
  onChange,
  onCustomMode,
}: PatternSuggestionRadioGroupProps): React.ReactElement {
  return (
    <RadioGroup
      value={value}
      onValueChange={(val) => {
        if (val === '__custom__') {
          onCustomMode()
        } else {
          onChange(val)
        }
      }}
      aria-label="Pattern suggestions"
      className="space-y-2"
    >
      {suggestions.map((suggestion) => (
        <div key={suggestion.pattern} className="flex items-center gap-2">
          <RadioGroupItem
            value={suggestion.pattern}
            id={`pattern-${suggestion.type}`}
          />
          <Label
            htmlFor={`pattern-${suggestion.type}`}
            className="flex items-center gap-2 cursor-pointer text-sm"
          >
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">
              {suggestion.label}
            </code>
            <span className="text-muted-foreground text-xs">
              ({suggestion.matchCount} transaction
              {suggestion.matchCount !== 1 ? 's' : ''})
            </span>
          </Label>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <RadioGroupItem value="__custom__" id="pattern-custom" />
        <Label
          htmlFor="pattern-custom"
          className="cursor-pointer text-sm text-muted-foreground"
        >
          Custom pattern...
        </Label>
      </div>
    </RadioGroup>
  )
}
