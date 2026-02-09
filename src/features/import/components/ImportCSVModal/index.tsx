import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  parseCSVPreview,
  autoDetectColumns,
  detectDateFormat,
} from '@/lib/csv/parser'
import type { CSVPreviewResult, ColumnMapping, DateFormatOption } from '@/lib/csv/parser'
import { parseCSVTransactions } from '../../services/csvImporter'
import { detectDuplicates } from '../../services/duplicateDetector'
import { importWithRules, showImportToast } from '../../services/importWithRules'
import type { DuplicateCheckResult, ParsedTransaction } from '../../types/duplicate.types'
import { cn } from '@/lib/utils'

type ImportCSVModalProps = {
  file: File
  accountId: number
  monthKey: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DATE_FORMAT_OPTIONS: { value: DateFormatOption; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY' },
  { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY' },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY' },
]

const UNMAPPED = '__unmapped__'

const formatTxDate = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function ImportCSVModal({
  file,
  accountId,
  monthKey,
  open,
  onOpenChange,
}: ImportCSVModalProps): React.ReactElement {
  const [preview, setPreview] = useState<CSVPreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importPhase, setImportPhase] = useState<'idle' | 'importing' | 'applying-rules'>('idle')
  const [dateColumn, setDateColumn] = useState(UNMAPPED)
  const [amountColumn, setAmountColumn] = useState(UNMAPPED)
  const [descriptionColumn, setDescriptionColumn] = useState(UNMAPPED)
  const [directionColumn, setDirectionColumn] = useState(UNMAPPED)
  const [dateFormat, setDateFormat] = useState<DateFormatOption>('auto')
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null)
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[] | null>(null)
  const [showImportAnywayConfirm, setShowImportAnywayConfirm] = useState(false)

  useEffect(() => {
    if (!open || !file) return

    setError(null)
    setPreview(null)
    setDateColumn(UNMAPPED)
    setAmountColumn(UNMAPPED)
    setDescriptionColumn(UNMAPPED)
    setDirectionColumn(UNMAPPED)
    setDateFormat('auto')
    setDuplicateResult(null)
    setParsedTransactions(null)

    parseCSVPreview(file)
      .then((result) => {
        setPreview(result)

        const detected = autoDetectColumns(result.headers, result.rows)
        if (detected.dateColumn) setDateColumn(detected.dateColumn)
        if (detected.amountColumn) setAmountColumn(detected.amountColumn)
        if (detected.descriptionColumn) setDescriptionColumn(detected.descriptionColumn)
        if (detected.directionColumn) setDirectionColumn(detected.directionColumn)

        if (detected.dateColumn) {
          const dateIdx = result.headers.indexOf(detected.dateColumn)
          if (dateIdx !== -1) {
            const sampleDates = result.rows
              .map((row) => row[dateIdx])
              .filter(Boolean)
            if (sampleDates.length > 0) {
              const format = detectDateFormat(sampleDates)
              if (format !== 'auto') {
                setDateFormat(format)
              }
            }
          }
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to parse CSV')
      })
  }, [open, file])

  const isMappingComplete =
    dateColumn !== UNMAPPED &&
    amountColumn !== UNMAPPED &&
    descriptionColumn !== UNMAPPED

  const handleImport = async (): Promise<void> => {
    if (!preview || !isMappingComplete) return

    setIsImporting(true)
    setImportPhase('importing')
    setError(null)

    try {
      const mapping: ColumnMapping = {
        dateColumn,
        amountColumn,
        descriptionColumn,
        ...(directionColumn !== UNMAPPED && { directionColumn }),
      }

      const parsed = await parseCSVTransactions(file, preview.hasHeaders, mapping, dateFormat)
      const dupResult = await detectDuplicates(accountId, parsed)

      if (dupResult.hasDuplicates) {
        setParsedTransactions(parsed)
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
      setError(err instanceof Error ? err.message : 'Import failed')
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
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsImporting(false)
      setImportPhase('idle')
    }
  }

  const handleImportAnyway = async (): Promise<void> => {
    if (!parsedTransactions) return

    setIsImporting(true)
    setImportPhase('importing')
    setShowImportAnywayConfirm(false)
    try {
      setImportPhase('applying-rules')
      const dupCount = duplicateResult?.duplicates.length ?? 0
      const result = await importWithRules(parsedTransactions, accountId, monthKey)
      onOpenChange(false)
      showImportToast(result, ` (including ${dupCount} duplicates)`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsImporting(false)
      setImportPhase('idle')
    }
  }

  const handleCancel = (): void => {
    setDuplicateResult(null)
    setParsedTransactions(null)
    onOpenChange(false)
  }

  const formatMonth = (key: string): string => {
    const [year, month] = key.split('-')
    const date = new Date(Number(year), Number(month) - 1)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const isDuplicate = (tx: ParsedTransaction): boolean => {
    if (!duplicateResult) return false
    return duplicateResult.duplicates.includes(tx)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Statement</DialogTitle>
            <DialogDescription>
              {formatMonth(monthKey)} &mdash; {file.name}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!preview && !error && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Parsing file...
            </div>
          )}

          {preview && !duplicateResult && (
            <>
              {/* Preview Table */}
              <div className="rounded-md border overflow-auto max-h-48">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {preview.headers.map((header, i) => (
                        <TableHead key={i} className="text-xs whitespace-nowrap">
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row, rowIdx) => (
                      <TableRow key={rowIdx}>
                        {row.map((cell, cellIdx) => (
                          <TableCell key={cellIdx} className="text-xs whitespace-nowrap">
                            {cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Column Mapping */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Column Mapping</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="date-column" className="text-xs">Date</Label>
                    <Select value={dateColumn} onValueChange={setDateColumn}>
                      <SelectTrigger id="date-column">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {preview.headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="amount-column" className="text-xs">Amount</Label>
                    <Select value={amountColumn} onValueChange={setAmountColumn}>
                      <SelectTrigger id="amount-column">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {preview.headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="description-column" className="text-xs">Description</Label>
                    <Select value={descriptionColumn} onValueChange={setDescriptionColumn}>
                      <SelectTrigger id="description-column">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {preview.headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="direction-column" className="text-xs">Direction (optional)</Label>
                    <Select value={directionColumn} onValueChange={setDirectionColumn}>
                      <SelectTrigger id="direction-column">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNMAPPED}>None</SelectItem>
                        {preview.headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Date Format */}
              <div className="space-y-1.5">
                <Label htmlFor="date-format" className="text-xs">Date Format</Label>
                <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as DateFormatOption)}>
                  <SelectTrigger id="date-format" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_FORMAT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Duplicate Detection Results */}
          {duplicateResult && parsedTransactions && (
            <>
              <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-500">
                    {duplicateResult.allDuplicates
                      ? `All ${duplicateResult.duplicates.length} transactions already exist`
                      : `${duplicateResult.duplicates.length} duplicate${duplicateResult.duplicates.length > 1 ? 's' : ''} found out of ${parsedTransactions.length} transactions`
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

              <div className="rounded-md border overflow-auto max-h-[40vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Status</TableHead>
                      <TableHead className="w-[110px]">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[100px] text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TooltipProvider>
                      {parsedTransactions.map((tx, idx) => {
                        const dup = isDuplicate(tx)
                        return (
                          <TableRow
                            key={idx}
                            className={cn(dup && 'bg-amber-500/5 opacity-70')}
                          >
                            <TableCell>
                              {dup && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-amber-500 border-amber-500/50 text-xs">
                                      Duplicate
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Matches existing transaction from {formatTxDate(tx.date)}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {formatTxDate(tx.date)}
                            </TableCell>
                            <TableCell className="text-xs truncate max-w-[200px]">
                              {tx.rawMerchantString}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums">
                              {tx.amount.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TooltipProvider>
                  </TableBody>
                </Table>
              </div>
            </>
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
                  disabled={!isMappingComplete || isImporting || !preview}
                >
                  {importPhase === 'applying-rules'
                    ? 'Applying rules...'
                    : isImporting
                      ? 'Importing...'
                      : 'Import'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={handleCancel} disabled={isImporting}>
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
                    {importPhase === 'applying-rules'
                      ? 'Applying rules...'
                      : isImporting
                        ? 'Importing...'
                        : `Import ${duplicateResult.unique.length} (Skip ${duplicateResult.duplicates.length} duplicates)`
                    }
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
