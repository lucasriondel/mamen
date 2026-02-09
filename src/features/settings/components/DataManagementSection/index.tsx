import { useState, useCallback } from 'react'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { db, useLiveQuery } from '@/lib/db'
import { exportAllData } from '../../services/exportService'
import { downloadFile, generateExportFilename } from '../../services/downloadFile'
import { ClearDataDialog } from '../ClearDataDialog'
import type { ExportOptions } from '../../types/export.types'

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
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_OPTIONS)

  const counts = useLiveQuery(async () => ({
    accounts: await db.accounts.count(),
    transactions: await db.transactions.count(),
    merchants: await db.merchants.count(),
    rules: await db.rules.count(),
    categories: await db.categories.count(),
    subscriptions: await db.subscriptions.count(),
  }))

  const handleToggle = useCallback((key: OptionKey) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const blob = await exportAllData(options)
      const filename = generateExportFilename()
      downloadFile(blob, filename)
      toast.success('Data exported successfully')
    } catch {
      toast.error('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }, [options])

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
            disabled={isExporting}
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

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-full">
                  <Button variant="outline" disabled className="w-full">
                    <Upload className="h-4 w-4" />
                    Import Data
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Coming soon</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <ClearDataDialog />
        </div>
      </CardContent>
    </Card>
  )
}
