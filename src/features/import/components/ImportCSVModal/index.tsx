import { useEffect, useState } from 'react'
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
import {
  parseCSVPreview,
  autoDetectColumns,
  detectDateFormat,
} from '@/lib/csv/parser'
import type { CSVPreviewResult, ColumnMapping, DateFormatOption } from '@/lib/csv/parser'
import { importCSV, undoImport } from '../../services/csvImporter'

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
  const [dateColumn, setDateColumn] = useState(UNMAPPED)
  const [amountColumn, setAmountColumn] = useState(UNMAPPED)
  const [descriptionColumn, setDescriptionColumn] = useState(UNMAPPED)
  const [dateFormat, setDateFormat] = useState<DateFormatOption>('auto')

  useEffect(() => {
    if (!open || !file) return

    setError(null)
    setPreview(null)
    setDateColumn(UNMAPPED)
    setAmountColumn(UNMAPPED)
    setDescriptionColumn(UNMAPPED)
    setDateFormat('auto')

    parseCSVPreview(file)
      .then((result) => {
        setPreview(result)

        const detected = autoDetectColumns(result.headers)
        if (detected.dateColumn) setDateColumn(detected.dateColumn)
        if (detected.amountColumn) setAmountColumn(detected.amountColumn)
        if (detected.descriptionColumn) setDescriptionColumn(detected.descriptionColumn)

        // Auto-detect date format from preview data
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
    setError(null)

    try {
      const mapping: ColumnMapping = {
        dateColumn,
        amountColumn,
        descriptionColumn,
      }

      const result = await importCSV(
        file,
        preview.hasHeaders,
        mapping,
        dateFormat,
        accountId,
        monthKey,
      )

      onOpenChange(false)

      toast.success(`${result.count} transactions imported`, {
        action: {
          label: 'Undo',
          onClick: () => {
            undoImport(result.importBatchId).then((count) => {
              toast.info(`${count} transactions removed`)
            })
          },
        },
        duration: 10000,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsImporting(false)
    }
  }

  const formatMonth = (key: string): string => {
    const [year, month] = key.split('-')
    const date = new Date(Number(year), Number(month) - 1)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  return (
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

        {preview && (
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
              <div className="grid grid-cols-3 gap-3">
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

        <DialogFooter>
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
            {isImporting ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
