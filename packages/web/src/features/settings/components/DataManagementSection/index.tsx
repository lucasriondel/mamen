import { useState, useCallback, useRef } from 'react'
import { Loader2, Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useQuery } from '@tanstack/react-query'
import {
  accountsApi,
  transactionsApi,
  merchantsApi,
  rulesApi,
  categoriesApi,
  subscriptionsApi,
  databaseApi,
  queryKeys,
} from '@/lib/api'
import { downloadFile, generateExportFilename } from '../../services/downloadFile'
import { parseBackupFile, importDataReplace, importDataMerge } from '../../services/importService'
import { ClearDataDialog } from '../ClearDataDialog'
import { ImportPreviewDialog } from '../ImportPreviewDialog'
import { ImportResultDialog } from '../ImportResultDialog'
import type { ExportOptions, ExportData } from '../../types/export.types'
import type { ImportMode, ImportPreview, ImportResult } from '../../types/import.types'

const DEFAULT_OPTIONS: ExportOptions = {
  includeAccounts: true,
  includeTransactions: true,
  includeMerchants: true,
  includeRules: true,
  includeCategories: true,
  includeSubscriptions: true,
  includeSettings: true,
}

type OptionKey = keyof ExportOptions

const OPTION_LABELS: { key: OptionKey; label: string }[] = [
  { key: 'includeAccounts', label: 'Accounts' },
  { key: 'includeTransactions', label: 'Transactions' },
  { key: 'includeMerchants', label: 'Merchants' },
  { key: 'includeRules', label: 'Rules' },
  { key: 'includeCategories', label: 'Categories' },
  { key: 'includeSubscriptions', label: 'Subscriptions' },
  { key: 'includeSettings', label: 'Settings' },
]

const formatCount = (n: number): string => n.toLocaleString()

export function DataManagementSection(): React.ReactElement {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_OPTIONS)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importFileData, setImportFileData] = useState<ExportData | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: counts } = useQuery({
    queryKey: ['dataManagementCounts'],
    queryFn: async () => {
      const [accounts, transactions, merchants, rules, categories, subscriptions] = await Promise.all([
        accountsApi.getAll().then(arr => arr.length),
        transactionsApi.count(),
        merchantsApi.getAll().then(arr => arr.length),
        rulesApi.getAll().then(arr => arr.length),
        categoriesApi.getAll().then(arr => arr.length),
        subscriptionsApi.getAll().then(arr => arr.length),
      ])
      return { accounts, transactions, merchants, rules, categories, subscriptions }
    },
  })

  const handleToggle = useCallback((key: OptionKey) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const data = await databaseApi.export()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const filename = generateExportFilename()
      downloadFile(blob, filename)
      toast.success('Data exported successfully')
    } catch {
      toast.error('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }, [])

  const handleFileSelected = useCallback(async (file: File) => {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      toast.error('Please select a .json backup file')
      return
    }

    const preview = await parseBackupFile(file)

    if (!preview.isValidFormat) {
      toast.error(`Invalid backup file: ${preview.validationErrors[0] || 'Unknown error'}`)
      return
    }

    // Parse the full data for import
    const text = await file.text()
    const parsed = JSON.parse(text) as ExportData

    setImportPreview(preview)
    setImportFileData(parsed)
    setShowPreview(true)
  }, [])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelected(file)
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [handleFileSelected])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files.length > 1) {
      toast.error('Please drop a single file')
      return
    }
    const file = files[0]
    if (file) {
      handleFileSelected(file)
    }
  }, [handleFileSelected])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleImport = useCallback(async (mode: ImportMode) => {
    if (!importFileData) return

    setShowPreview(false)
    setIsImporting(true)
    setShowResult(true)

    try {
      const result = mode === 'replace'
        ? await importDataReplace(importFileData)
        : await importDataMerge(importFileData)

      setImportResult(result)

      if (result.success) {
        if (mode === 'replace') {
          toast.success('Data restored from backup')
        } else {
          toast.success('Import complete')
        }
      } else {
        toast.error('Import completed with errors')
      }
    } catch {
      toast.error('Import failed. Please try again.')
    } finally {
      setIsImporting(false)
      setImportFileData(null)
    }
  }, [importFileData])

  const handlePreviewCancel = useCallback(() => {
    setShowPreview(false)
    setImportPreview(null)
    setImportFileData(null)
  }, [])

  const handleResultClose = useCallback(() => {
    setShowResult(false)
    setImportResult(null)
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Management</CardTitle>
        <CardDescription>
          Export, import, or clear your data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {counts && (
          <div className="rounded-md border p-3">
            <p className="text-sm font-medium mb-1">Storage usage</p>
            <p className="text-sm text-muted-foreground">
              {formatCount(counts.accounts)} accounts,{' '}
              {formatCount(counts.transactions)} transactions,{' '}
              {formatCount(counts.merchants)} merchants,{' '}
              {formatCount(counts.rules)} rules
            </p>
          </div>
        )}

        <div className="space-y-3">
          <Label>Include in export</Label>
          <div className="grid grid-cols-2 gap-2">
            {OPTION_LABELS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={options[key]}
                  onCheckedChange={() => handleToggle(key)}
                  disabled={isExporting}
                />
                <Label
                  htmlFor={key}
                  className="text-sm font-normal cursor-pointer"
                >
                  {label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleExport}
            disabled={isExporting || isImporting}
            className="w-full"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export All Data
              </>
            )}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <Button
            variant="outline"
            className="w-full"
            onClick={handleImportClick}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            disabled={isExporting || isImporting}
          >
            <Upload className="h-4 w-4" />
            Import Data
          </Button>

          <ClearDataDialog />
        </div>

        {importPreview && (
          <ImportPreviewDialog
            open={showPreview}
            preview={importPreview}
            onImport={handleImport}
            onCancel={handlePreviewCancel}
          />
        )}

        <ImportResultDialog
          open={showResult}
          loading={isImporting}
          result={importResult}
          onClose={handleResultClose}
        />
      </CardContent>
    </Card>
  )
}
