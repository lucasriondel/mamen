import { useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { importWithRules, showImportToast } from '../../services/importWithRules'
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
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { detectDuplicates } from '../../services/duplicateDetector'
import type { DuplicateCheckResult, ParsedTransaction } from '../../types/duplicate.types'
import type { LLMTransaction } from '@/lib/schemas/llmTransaction.schema'
import { cn } from '@/lib/utils'

type PDFImportPreviewProps = {
  transactions: LLMTransaction[]
  accountId: number
  monthKey: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type EditableTransaction = LLMTransaction & { id: string }

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function formatMonth(key: string): string {
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const formatTxDate = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const toParsedTransactions = (transactions: EditableTransaction[]): ParsedTransaction[] =>
  transactions.map((t) => ({
    date: new Date(t.date),
    amount: t.amount,
    rawMerchantString: t.description.trim(),
  }))

export function PDFImportPreview({
  transactions: initialTransactions,
  accountId,
  monthKey,
  open,
  onOpenChange,
}: PDFImportPreviewProps): React.ReactElement {
  const [transactions, setTransactions] = useState<EditableTransaction[]>(() =>
    initialTransactions.map((t, i) => ({ ...t, id: `pdf-${i}` })),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isImporting, setIsImporting] = useState(false)
  const [importPhase, setImportPhase] = useState<'idle' | 'importing' | 'applying-rules'>('idle')
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null)
  const [showImportAnywayConfirm, setShowImportAnywayConfirm] = useState(false)

  const handleFieldChange = (
    id: string,
    field: keyof LLMTransaction,
    value: string,
  ): void => {
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        if (field === 'amount') {
          const num = Number(value)
          return { ...t, amount: isNaN(num) ? t.amount : num }
        }
        return { ...t, [field]: value }
      }),
    )

    setErrors((prev) => {
      const next = { ...prev }
      delete next[`${id}-${field}`]
      return next
    })
  }

  const handleRemoveTransaction = (id: string): void => {
    setTransactions((prev) => prev.filter((t) => t.id !== id))
    setDuplicateResult(null)
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    for (const t of transactions) {
      if (!DATE_REGEX.test(t.date)) {
        newErrors[`${t.id}-date`] = 'Invalid date format (YYYY-MM-DD)'
      }
      if (isNaN(t.amount)) {
        newErrors[`${t.id}-amount`] = 'Invalid number'
      }
      if (!t.description.trim()) {
        newErrors[`${t.id}-description`] = 'Required'
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleImport = async (): Promise<void> => {
    if (transactions.length === 0) return
    if (!validate()) return

    setIsImporting(true)
    setImportPhase('importing')
    try {
      const parsed = toParsedTransactions(transactions)
      const dupResult = await detectDuplicates(accountId, parsed)

      if (dupResult.hasDuplicates) {
        setDuplicateResult(dupResult)
        setIsImporting(false)
        setImportPhase('idle')
        return
      }

      setImportPhase('applying-rules')
      const result = await importWithRules(parsed, accountId, monthKey)
      onOpenChange(false)
      showImportToast(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsImporting(false)
      setImportPhase('idle')
    }
  }

  const handleSkipDuplicates = async (): Promise<void> => {
    if (!duplicateResult) return

    setIsImporting(true)
    setImportPhase('importing')
    try {
      setImportPhase('applying-rules')
      const result = await importWithRules(duplicateResult.unique, accountId, monthKey)
      onOpenChange(false)
      showImportToast(result, `, ${duplicateResult.duplicates.length} duplicates skipped`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsImporting(false)
      setImportPhase('idle')
    }
  }

  const handleImportAnyway = async (): Promise<void> => {
    setIsImporting(true)
    setImportPhase('importing')
    setShowImportAnywayConfirm(false)
    try {
      setImportPhase('applying-rules')
      const parsed = toParsedTransactions(transactions)
      const dupCount = duplicateResult?.duplicates.length ?? 0
      const result = await importWithRules(parsed, accountId, monthKey)
      onOpenChange(false)
      showImportToast(result, ` (including ${dupCount} duplicates)`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsImporting(false)
      setImportPhase('idle')
    }
  }

  const isDuplicateTx = (tx: EditableTransaction): boolean => {
    if (!duplicateResult) return false
    const parsed: ParsedTransaction = {
      date: new Date(tx.date),
      amount: tx.amount,
      rawMerchantString: tx.description.trim(),
    }
    return duplicateResult.duplicates.some(
      (d) =>
        d.date.getTime() === parsed.date.getTime() &&
        d.amount === parsed.amount &&
        d.rawMerchantString === parsed.rawMerchantString,
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import PDF Transactions</DialogTitle>
            <DialogDescription>
              {formatMonth(monthKey)} &mdash; Found {transactions.length} transactions
            </DialogDescription>
          </DialogHeader>

          {duplicateResult && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-500">
                  {duplicateResult.allDuplicates
                    ? `All ${duplicateResult.duplicates.length} transactions already exist`
                    : `${duplicateResult.duplicates.length} duplicate${duplicateResult.duplicates.length > 1 ? 's' : ''} found out of ${transactions.length} transactions`
                  }
                </p>
                <p className="text-xs text-muted-foreground">
                  Duplicates are identified by matching account, date, amount, and description
                </p>
                {duplicateResult.allDuplicates && (
                  <p className="text-xs text-muted-foreground mt-1">
                    This statement appears to have been imported previously
                  </p>
                )}
              </div>
            </div>
          )}

          {transactions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              All transactions have been removed. Cancel or drop a new file.
            </div>
          ) : (
            <div className="rounded-md border overflow-auto max-h-[50vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {duplicateResult && <TableHead className="w-[80px]">Status</TableHead>}
                    <TableHead className="w-[140px]">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[120px]">Amount</TableHead>
                    {!duplicateResult && <TableHead className="w-[50px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TooltipProvider>
                    {transactions.map((t) => {
                      const dup = isDuplicateTx(t)
                      return (
                        <TableRow
                          key={t.id}
                          className={cn(duplicateResult && dup && 'bg-amber-500/5 opacity-70')}
                        >
                          {duplicateResult && (
                            <TableCell>
                              {dup && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-amber-500 border-amber-500/50 text-xs">
                                      Duplicate
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Matches existing transaction from {formatTxDate(new Date(t.date))}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            <Input
                              value={t.date}
                              onChange={(e) => handleFieldChange(t.id, 'date', e.target.value)}
                              className={errors[`${t.id}-date`] ? 'border-destructive' : ''}
                              aria-label="Date"
                              disabled={!!duplicateResult}
                            />
                            {errors[`${t.id}-date`] && (
                              <span className="text-xs text-destructive">{errors[`${t.id}-date`]}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              value={t.description}
                              onChange={(e) => handleFieldChange(t.id, 'description', e.target.value)}
                              className={errors[`${t.id}-description`] ? 'border-destructive' : ''}
                              aria-label="Description"
                              disabled={!!duplicateResult}
                            />
                            {errors[`${t.id}-description`] && (
                              <span className="text-xs text-destructive">{errors[`${t.id}-description`]}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={t.amount}
                              onChange={(e) => handleFieldChange(t.id, 'amount', e.target.value)}
                              className={errors[`${t.id}-amount`] ? 'border-destructive' : ''}
                              aria-label="Amount"
                              disabled={!!duplicateResult}
                            />
                            {errors[`${t.id}-amount`] && (
                              <span className="text-xs text-destructive">{errors[`${t.id}-amount`]}</span>
                            )}
                          </TableCell>
                          {!duplicateResult && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveTransaction(t.id)}
                                aria-label="Remove transaction"
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TooltipProvider>
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter className="gap-2">
            {!duplicateResult ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isImporting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={transactions.length === 0 || isImporting}
                >
                  {importPhase === 'applying-rules' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Applying rules...
                    </>
                  ) : isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${transactions.length} transactions`
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDuplicateResult(null)
                    onOpenChange(false)
                  }}
                  disabled={isImporting}
                >
                  Cancel
                </Button>
                {!duplicateResult.allDuplicates && (
                  <Button
                    variant="secondary"
                    onClick={() => setShowImportAnywayConfirm(true)}
                    disabled={isImporting}
                  >
                    Import Anyway
                  </Button>
                )}
                {duplicateResult.allDuplicates ? (
                  <Button
                    onClick={() => setShowImportAnywayConfirm(true)}
                    disabled={isImporting}
                  >
                    Import Anyway
                  </Button>
                ) : (
                  <Button onClick={handleSkipDuplicates} disabled={isImporting}>
                    {importPhase === 'applying-rules' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Applying rules...
                      </>
                    ) : isImporting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      `Import ${duplicateResult.unique.length} (Skip ${duplicateResult.duplicates.length} duplicates)`
                    )}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showImportAnywayConfirm} onOpenChange={setShowImportAnywayConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import duplicates?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This may create duplicate entries in your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleImportAnyway}>
              Import Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
