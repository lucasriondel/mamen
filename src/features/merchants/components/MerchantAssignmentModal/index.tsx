import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { CategoryPicker } from '@/components/CategoryPicker'
import { MatchPreviewList } from '@/components/MatchPreviewList'
import { RegexCheatsheet } from '@/components/RegexCheatsheet'
import { PatternSuggestionRadioGroup } from '../PatternSuggestionRadioGroup'
import { generatePatternSuggestions, type PatternSuggestion } from '@/features/rules/services/ruleEngine'
import { applyRuleToTransactions, undoRuleApplication } from '@/features/rules/services/applyRule'
import { cleanMerchantString, validateRegexPattern } from '@/lib/utils/patternUtils'
import { useMerchants } from '@/hooks/useMerchants'
import { useCategories } from '@/hooks/useCategories'
import { db } from '@/lib/db'
import type { Transaction } from '@/types'
import { ChevronDown } from 'lucide-react'

type MerchantAssignmentModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
  powerMode?: boolean
  onComplete?: () => void
}

export function MerchantAssignmentModal({
  open,
  onOpenChange,
  transaction,
  powerMode = false,
  onComplete,
}: MerchantAssignmentModalProps): React.ReactElement {
  const { createMerchant, getMerchantByName } = useMerchants()
  const { getCategoryById } = useCategories()

  const [merchantName, setMerchantName] = useState('')
  const [selectedPattern, setSelectedPattern] = useState('')
  const [customPattern, setCustomPattern] = useState('')
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined)
  const [setAsDefault, setSetAsDefault] = useState(true)
  const [suggestions, setSuggestions] = useState<PatternSuggestion[]>([])
  const [duplicateWarning, setDuplicateWarning] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)

  const activePattern = isCustomMode ? customPattern : selectedPattern
  const patternValidation = isCustomMode ? validateRegexPattern(customPattern) : { valid: true }
  const isFormValid =
    merchantName.trim().length > 0 &&
    activePattern.length > 0 &&
    patternValidation.valid &&
    categoryId !== undefined &&
    !duplicateWarning

  // Reset form when transaction changes
  useEffect(() => {
    if (transaction && open) {
      const cleaned = cleanMerchantString(transaction.rawMerchantString)
      setMerchantName(cleaned)
      setSelectedPattern('')
      setCustomPattern('')
      setIsCustomMode(powerMode)
      setCategoryId(undefined)
      setSetAsDefault(true)
      setDuplicateWarning('')
      setCategoryPickerOpen(false)

      generatePatternSuggestions(transaction.rawMerchantString).then(
        (result) => {
          setSuggestions(result)
          if (result.length > 0 && !powerMode) {
            setSelectedPattern(result[0].pattern)
          }
        },
      )
    }
  }, [transaction, open, powerMode])

  // Check for duplicate merchant names
  useEffect(() => {
    if (!merchantName.trim()) {
      setDuplicateWarning('')
      return
    }
    const timer = setTimeout(async () => {
      const existing = await getMerchantByName(merchantName.trim())
      if (existing) {
        setDuplicateWarning(`Merchant "${existing.name}" already exists`)
      } else {
        setDuplicateWarning('')
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [merchantName, getMerchantByName])

  const handleCategorySelect = useCallback(
    (catId: number, subCatId?: number) => {
      setCategoryId(subCatId ?? catId)
      setCategoryPickerOpen(false)
    },
    [],
  )

  const handleSubmit = async (): Promise<void> => {
    if (!isFormValid || !transaction) return

    setIsSubmitting(true)
    try {
      const merchantId = await createMerchant(
        merchantName.trim(),
        setAsDefault ? categoryId : undefined,
      )

      const ruleId = (await db.rules.add({
        merchantId,
        pattern: activePattern,
        matchCount: 0,
        createdAt: new Date(),
      })) as number

      const rule = {
        id: ruleId,
        merchantId,
        pattern: activePattern,
        matchCount: 0,
        createdAt: new Date(),
      }

      const { count, affectedIds } = await applyRuleToTransactions(
        rule,
        categoryId!,
      )

      onOpenChange(false)
      onComplete?.()

      toast(`${count} transaction${count !== 1 ? 's' : ''} → ${merchantName.trim()}`, {
        action: {
          label: 'Undo',
          onClick: () => {
            undoRuleApplication(merchantId, ruleId, affectedIds)
            toast('Merchant creation undone')
          },
        },
        duration: 10000,
      })
    } catch (error) {
      toast.error('Failed to create merchant', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedCategory = categoryId ? getCategoryById(categoryId) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[480px]"
        aria-labelledby="merchant-modal-title"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isFormValid && !isSubmitting) {
            e.preventDefault()
            handleSubmit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle id="merchant-modal-title">Assign to Merchant</DialogTitle>
          <DialogDescription>
            Transaction:{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
              {transaction?.rawMerchantString}
            </code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Merchant Name */}
          <div className="space-y-2">
            <Label htmlFor="merchant-name">Merchant name</Label>
            <Input
              id="merchant-name"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              placeholder="Enter merchant name"
              aria-invalid={!!duplicateWarning}
            />
            {duplicateWarning && (
              <p className="text-xs text-amber-500" role="alert">
                {duplicateWarning}
              </p>
            )}
          </div>

          {/* Pattern Selection */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Create rule from pattern</Label>
              {isCustomMode && <RegexCheatsheet />}
            </div>

            {isCustomMode ? (
              <div className="space-y-1">
                <Input
                  value={customPattern}
                  onChange={(e) => setCustomPattern(e.target.value)}
                  placeholder="Enter regex pattern"
                  className="font-mono text-sm"
                  aria-invalid={!patternValidation.valid}
                  aria-describedby={
                    !patternValidation.valid ? 'pattern-error' : undefined
                  }
                />
                {!patternValidation.valid && patternValidation.error && (
                  <p
                    id="pattern-error"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    {patternValidation.error}
                  </p>
                )}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    setIsCustomMode(false)
                    if (suggestions.length > 0) {
                      setSelectedPattern(suggestions[0].pattern)
                    }
                  }}
                >
                  Use suggestions
                </Button>
              </div>
            ) : (
              <PatternSuggestionRadioGroup
                suggestions={suggestions}
                value={selectedPattern}
                onChange={setSelectedPattern}
                onCustomMode={() => setIsCustomMode(true)}
              />
            )}
          </div>

          {/* Category Picker */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Popover open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  type="button"
                >
                  {selectedCategory ? (
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: selectedCategory.color }}
                        aria-hidden="true"
                      />
                      {selectedCategory.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select category...</span>
                  )}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <CategoryPicker
                  value={categoryId}
                  onSelect={handleCategorySelect}
                />
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-2">
              <Checkbox
                id="set-default"
                checked={setAsDefault}
                onCheckedChange={(checked) =>
                  setSetAsDefault(checked === true)
                }
              />
              <Label htmlFor="set-default" className="text-xs cursor-pointer">
                Set as default category for this merchant
              </Label>
            </div>
          </div>

          {/* Match Preview */}
          {activePattern && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <MatchPreviewList pattern={activePattern} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid || isSubmitting}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
