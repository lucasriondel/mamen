import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ImportResult } from '../../types/import.types'

type ImportResultDialogProps = {
  open: boolean
  loading: boolean
  result: ImportResult | null
  onClose: () => void
}

export function ImportResultDialog({
  open,
  loading,
  result,
  onClose,
}: ImportResultDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {loading ? 'Importing Data...' : 'Import Complete'}
          </DialogTitle>
          {loading && (
            <DialogDescription>
              Please wait while your data is being imported.
            </DialogDescription>
          )}
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && result && (
          <div className="space-y-3">
            {result.success && result.mode === 'replace' && (
              <div className="rounded-md border p-3">
                <p className="text-sm font-medium mb-1">Data restored from backup</p>
                <p className="text-sm text-muted-foreground">
                  {result.added.accounts} accounts,{' '}
                  {result.added.transactions} transactions,{' '}
                  {result.added.merchants} merchants imported
                </p>
              </div>
            )}

            {result.success && result.mode === 'merge' && (
              <div className="rounded-md border p-3">
                <p className="text-sm font-medium mb-1">Import complete</p>
                <p className="text-sm text-muted-foreground">
                  Added {result.added.accounts} accounts,{' '}
                  {result.added.transactions} transactions,{' '}
                  {result.added.merchants} merchants.
                  {result.skipped.transactions > 0 && (
                    <> Skipped {result.skipped.transactions} duplicate transactions.</>
                  )}
                </p>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
                <p className="text-sm font-medium text-destructive mb-1">Errors</p>
                <ul className="text-sm text-destructive space-y-1">
                  {result.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!loading && (
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
