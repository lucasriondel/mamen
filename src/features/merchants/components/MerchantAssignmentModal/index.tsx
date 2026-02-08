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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { CategoryPicker } from '@/components/CategoryPicker'
import { MatchPreviewList } from '@/components/MatchPreviewList'
import { RegexCheatsheet } from '@/components/RegexCheatsheet'
import { PatternSuggestionRadioGroup } from '../PatternSuggestionRadioGroup'
import { MerchantSearchSelect } from '../MerchantSearchSelect'
import { MerchantRulesList } from '../MerchantRulesList'
import { generatePatternSuggestions, type PatternSuggestion } from '@/features/rules/services/ruleEngine'
import { applyRuleToTransactions, undoRuleApplication } from '@/features/rules/services/applyRule'
import { addRuleToMerchant, undoAddRule } from '@/features/rules/services/addRuleToMerchant'
import { detectRuleConflict } from '@/features/rules/services/detectRuleConflict'
import { cleanMerchantString, validateRegexPattern } from '@/lib/utils/patternUtils'
import { useMerchants } from '@/hooks/useMerchants'
import { useCategories } from '@/hooks/useCategories'
import { useExistingMerchant } from '../../hooks/useExistingMerchant'
import { db } from '@/lib/db'
import type { Transaction } from '@/types'
import { AlertTriangle, ChevronDown } from 'lucide-react'

type MerchantAssignmentModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
  powerMode?: boolean
  onComplete?: () => void
}

type ConflictWarning = {
  conflictingMerchant: string
  conflictingPattern: string
  specificity: 'more' | 'less' | 'equal'
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

  // Assignment mode: new or existing
  const [assignmentMode, setAssignmentMode] = useState<'new' | 'existing'>('new')

  // New merchant state
  const [merchantName, setMerchantName] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState('')

  // Existing merchant state
  const [selectedMerchantId, setSelectedMerchantId] = useState<number | null>(null)

  // Shared state
  const [selectedPattern, setSelectedPattern] = useState('')
  const [customPattern, setCustomPattern] = useState('')
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined)
  const [setAsDefault, setSetAsDefault] = useState(true)
  const [categoryOverrideEnabled, setCategoryOverrideEnabled] = useState(false)
  const [suggestions, setSuggestions] = useState<PatternSuggestion[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [conflictWarning, setConflictWarning] = useState<ConflictWarning | null>(null)
  const [duplicatePatternError, setDuplicatePatternError] = useState('')

  const { merchant: existingMerchant, rules: existingRules } = useExistingMerchant(
    assignmentMode === 'existing' ? selectedMerchantId : null,
  )

  const activePattern = isCustomMode ? customPattern : selectedPattern
  const patternValidation = isCustomMode ? validateRegexPattern(customPattern) : { valid: true }

  const isNewFormValid =
    assignmentMode === 'new' &&
    merchantName.trim().length > 0 &&
    activePattern.length > 0 &&
    patternValidation.valid &&
    categoryId !== undefined &&
    !duplicateWarning &&
    !duplicatePatternError

  const isExistingFormValid =
    assignmentMode === 'existing' &&
    selectedMerchantId !== null &&
    activePattern.length > 0 &&
    patternValidation.valid &&
    !duplicatePatternError &&
    (categoryOverrideEnabled ? categoryId !== undefined : existingMerchant?.defaultCategoryId !== undefined)

  const isFormValid = isNewFormValid || isExistingFormValid

  // Reset form when transaction changes
  useEffect(() => {
    if (transaction && open) {
      const cleaned = cleanMerchantString(transaction.rawMerchantString)
      setMerchantName(cleaned)
      setAssignmentMode('new')
      setSelectedMerchantId(null)
      setSelectedPattern('')
      setCustomPattern('')
      setIsCustomMode(powerMode)
      setCategoryId(undefined)
      setSetAsDefault(true)
      setCategoryOverrideEnabled(false)
      setDuplicateWarning('')
      setCategoryPickerOpen(false)
      setConflictWarning(null)
      setDuplicatePatternError('')

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

  // Check for duplicate merchant names (new mode only)
  useEffect(() => {
    if (assignmentMode !== 'new' || !merchantName.trim()) {
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
  }, [merchantName, getMerchantByName, assignmentMode])

  // When existing merchant is selected, default category to merchant's default
  useEffect(() => {
    if (existingMerchant && assignmentMode === 'existing') {
      if (existingMerchant.defaultCategoryId !== undefined) {
        setCategoryId(existingMerchant.defaultCategoryId)
      }
      setCategoryOverrideEnabled(false)
    }
  }, [existingMerchant, assignmentMode])

  // Check for rule conflicts when pattern changes
  useEffect(() => {
    if (!activePattern) {
      setConflictWarning(null)
      return
    }
    const timer = setTimeout(async () => {
      const excludeId = assignmentMode === 'existing' ? selectedMerchantId ?? undefined : undefined
      const result = await detectRuleConflict(activePattern, excludeId)
      if (result.hasConflict) {
        setConflictWarning({
          conflictingMerchant: result.conflictingMerchant!,
          conflictingPattern: result.conflictingPattern!,
          specificity: result.specificity!,
        })
      } else {
        setConflictWarning(null)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [activePattern, assignmentMode, selectedMerchantId])

  // Check for duplicate pattern within same merchant
  useEffect(() => {
    if (assignmentMode !== 'existing' || !selectedMerchantId || !activePattern) {
      setDuplicatePatternError('')
      return
    }
    const isDuplicate = existingRules.some((r) => r.pattern === activePattern)
    if (isDuplicate) {
      setDuplicatePatternError(
        `This pattern already exists for ${existingMerchant?.name ?? 'this merchant'}`,
      )
    } else {
      setDuplicatePatternError('')
    }
  }, [activePattern, existingRules, existingMerchant, assignmentMode, selectedMerchantId])

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
      if (assignmentMode === 'new') {
        // Existing Story 4.3 flow
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
      } else {
        // Existing merchant flow
        if (!selectedMerchantId) return

        const overrideId = categoryOverrideEnabled ? (categoryId ?? null) : null
        const result = await addRuleToMerchant({
          merchantId: selectedMerchantId,
          pattern: activePattern,
          categoryOverrideId: overrideId,
        })

        onOpenChange(false)
        onComplete?.()

        const merchantDisplayName = existingMerchant?.name ?? 'merchant'
        toast(
          `${result.matchCount} transaction${result.matchCount !== 1 ? 's' : ''} → ${merchantDisplayName}`,
          {
            action: {
              label: 'Undo',
              onClick: () => {
                undoAddRule(result.ruleId, result.affectedTransactionIds)
                toast('Rule addition undone')
              },
            },
            duration: 10000,
          },
        )
      }
    } catch (error) {
      toast.error(
        assignmentMode === 'new' ? 'Failed to create merchant' : 'Failed to add rule',
        {
          description: error instanceof Error ? error.message : 'Unknown error',
        },
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedCategory = categoryId ? getCategoryById(categoryId) : undefined
  const defaultCategory = existingMerchant?.defaultCategoryId
    ? getCategoryById(existingMerchant.defaultCategoryId)
    : undefined

  const specificityMessage = conflictWarning?.specificity === 'more'
    ? 'Your rule is more specific and will take priority'
    : conflictWarning?.specificity === 'less'
      ? 'Your rule is less specific and will be overridden'
      : 'Both rules have equal specificity'

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
          {/* Assignment Mode Toggle */}
          <div className="space-y-2">
            <Label>Assign to</Label>
            <RadioGroup
              value={assignmentMode}
              onValueChange={(val) => setAssignmentMode(val as 'new' | 'existing')}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="new" id="mode-new" />
                <Label htmlFor="mode-new" className="cursor-pointer text-sm">
                  New merchant
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="existing" id="mode-existing" />
                <Label htmlFor="mode-existing" className="cursor-pointer text-sm">
                  Existing merchant
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* New Merchant Name Input */}
          {assignmentMode === 'new' && (
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
          )}

          {/* Existing Merchant Search */}
          {assignmentMode === 'existing' && (
            <div className="space-y-2">
              <Label>Select merchant</Label>
              <MerchantSearchSelect
                value={selectedMerchantId}
                onChange={setSelectedMerchantId}
              />
              {selectedMerchantId !== null && existingMerchant && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Current rules
                  </Label>
                  <MerchantRulesList merchantId={selectedMerchantId} />
                </div>
              )}
            </div>
          )}

          {/* Pattern Selection */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>
                {assignmentMode === 'new' ? 'Create rule from pattern' : 'Add rule pattern'}
              </Label>
              {isCustomMode && <RegexCheatsheet />}
            </div>

            {isCustomMode ? (
              <div className="space-y-1">
                <Input
                  value={customPattern}
                  onChange={(e) => setCustomPattern(e.target.value)}
                  placeholder="Enter regex pattern"
                  className="font-mono text-sm"
                  aria-invalid={!patternValidation.valid || !!duplicatePatternError}
                  aria-describedby={
                    !patternValidation.valid ? 'pattern-error' :
                    duplicatePatternError ? 'duplicate-pattern-error' : undefined
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

            {/* Duplicate pattern error */}
            {duplicatePatternError && (
              <p
                id="duplicate-pattern-error"
                className="text-xs text-destructive"
                role="alert"
              >
                {duplicatePatternError}
              </p>
            )}
          </div>

          {/* Conflict Warning */}
          {conflictWarning && (
            <div
              className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3"
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-medium text-amber-500">
                  Pattern overlaps with {conflictWarning.conflictingMerchant}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {specificityMessage}
                </p>
              </div>
            </div>
          )}

          {/* Category Picker */}
          <div className="space-y-2">
            <Label>Category</Label>

            {assignmentMode === 'existing' && existingMerchant ? (
              <>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="category-override"
                    checked={categoryOverrideEnabled}
                    onCheckedChange={(checked) =>
                      setCategoryOverrideEnabled(checked === true)
                    }
                  />
                  <Label htmlFor="category-override" className="text-xs cursor-pointer">
                    Override category for this rule
                  </Label>
                </div>

                {!categoryOverrideEnabled && defaultCategory && (
                  <p className="text-xs text-muted-foreground">
                    Uses merchant default:{' '}
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-full inline-block"
                        style={{ backgroundColor: defaultCategory.color }}
                        aria-hidden="true"
                      />
                      {defaultCategory.name}
                    </span>
                  </p>
                )}

                {categoryOverrideEnabled && (
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
                )}
              </>
            ) : (
              <>
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
              </>
            )}
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
            {assignmentMode === 'new' ? 'Create' : 'Add Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
