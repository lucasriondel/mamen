import { useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CreditCard, Loader2, Plus, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { accountsApi, transactionsApi, queryKeys, invalidateEntity } from '@/lib/api'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AccountCard } from '@/features/accounts/components/AccountCard'
import { AccountMonthGrid } from '@/features/import/components/AccountMonthGrid'
import { ImportCSVModal } from '@/features/import/components/ImportCSVModal'
import { PDFImportPreview } from '@/features/import/components/PDFImportPreview'
import { CreateAccountModal } from '@/features/accounts/components/CreateAccountModal'
import { EditAccountModal } from '@/features/accounts/components/EditAccountModal'
import { deleteTransactionsForMonth } from '@/features/import/services/csvImporter'
import { extractTextFromPDF } from '@/features/import/services/pdfExtractor'
import { parseStatementWithLLM } from '@/features/import/services/llmStatementParser'
import { checkLLMRequirements } from '@/lib/llm/guards'
import type { Account } from '@/types'
import type { Transaction } from '@/types'
import type { LLMTransaction } from '@/lib/schemas'

type UndoState = {
  account: Account
  transactions: Transaction[]
  timeoutId: number
}

type ImportModalState = {
  file: File
  monthKey: string
  accountId: number
}

type ReimportState = {
  file: File
  monthKey: string
  accountId: number
  existingCount: number
}

type PDFPreviewState = {
  transactions: LLMTransaction[]
  monthKey: string
  accountId: number
}

type PDFParsingState = {
  monthKey: string
  accountId: number
}

type LLMErrorState = {
  message: string
  errorType: 'network' | 'timeout' | 'parse' | 'invalid-response'
  file: File
  monthKey: string
  accountId: number
}

type LLMNotConfiguredState = {
  file: File
  monthKey: string
  accountId: number
}

export const Route = createFileRoute('/accounts')({
  component: AccountsPage,
})

export function AccountsPage(): React.ReactElement {
  const [createOpen, setCreateOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null)
  const [deleteTransactionCount, setDeleteTransactionCount] = useState(0)
  const [reimportState, setReimportState] = useState<ReimportState | null>(null)
  const [importModalState, setImportModalState] = useState<ImportModalState | null>(null)
  const [pdfPreviewState, setPdfPreviewState] = useState<PDFPreviewState | null>(null)
  const [pdfParsingState, setPdfParsingState] = useState<PDFParsingState | null>(null)
  const [llmErrorState, setLlmErrorState] = useState<LLMErrorState | null>(null)
  const [llmNotConfiguredState, setLlmNotConfiguredState] = useState<LLMNotConfiguredState | null>(null)
  const undoRef = useRef<UndoState | null>(null)
  const navigate = useNavigate()

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts.all,
    queryFn: () => accountsApi.getAll(),
  })

  const handleOpenCreate = (): void => {
    setCreateOpen(true)
  }

  const handleMonthClick = (monthKey: string, accountId: number): void => {
    navigate({
      to: '/transactions',
      search: { accountId, month: monthKey },
    })
  }

  const handleFileDropped = (file: File, monthKey: string, accountId: number, transactionCount: number): void => {
    if (transactionCount > 0) {
      setReimportState({ file, monthKey, accountId, existingCount: transactionCount })
    } else {
      handleImportFile(file, monthKey, accountId)
    }
  }

  const handleImportFile = (file: File, monthKey: string, accountId: number): void => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    const mimeType = file.type
    if (ext === 'csv' || mimeType === 'text/csv') {
      setImportModalState({ file, monthKey, accountId })
    } else if (ext === 'pdf' || mimeType === 'application/pdf') {
      handlePDFImport(file, monthKey, accountId)
    } else {
      toast.error('Unsupported file type. Please upload a CSV or PDF file.')
    }
  }

  const handlePDFImport = async (file: File, monthKey: string, accountId: number): Promise<void> => {
    const llmCheck = await checkLLMRequirements()
    if (!llmCheck.ready) {
      setLlmNotConfiguredState({ file, monthKey, accountId })
      return
    }

    setPdfParsingState({ monthKey, accountId })

    try {
      const text = await extractTextFromPDF(file)
      const result = await parseStatementWithLLM(text, llmCheck.settings!)

      setPdfParsingState(null)

      if (result.success) {
        setPdfPreviewState({ transactions: result.transactions, monthKey, accountId })
      } else {
        setLlmErrorState({ message: result.error, errorType: result.errorType, file, monthKey, accountId })
      }
    } catch (err) {
      setPdfParsingState(null)
      setLlmErrorState({
        message: err instanceof Error ? err.message : 'Could not read PDF file. The file may be corrupted or password-protected.',
        errorType: 'parse',
        file,
        monthKey,
        accountId,
      })
    }
  }

  const handleRetryPDF = (): void => {
    if (!llmErrorState) return
    const { file, monthKey, accountId } = llmErrorState
    setLlmErrorState(null)
    handlePDFImport(file, monthKey, accountId)
  }

  const handleFallbackToCSV = (): void => {
    if (llmErrorState) {
      toast.info('Please re-upload as a CSV file.')
      setLlmErrorState(null)
    }
    if (llmNotConfiguredState) {
      toast.info('Please re-upload as a CSV file.')
      setLlmNotConfiguredState(null)
    }
  }

  const handleConfirmReimport = async (): Promise<void> => {
    if (!reimportState) return
    const { file, monthKey, accountId } = reimportState
    await deleteTransactionsForMonth(accountId, monthKey)
    invalidateEntity('transactions')
    setReimportState(null)
    handleImportFile(file, monthKey, accountId)
  }

  const handleEdit = (account: Account): void => {
    setEditingAccount(account)
  }

  const handleCloseEdit = (): void => {
    setEditingAccount(null)
  }

  const handleDeleteRequest = async (account: Account): Promise<void> => {
    if (account.id === undefined) return
    const count = await transactionsApi.count({ accountId: account.id })
    setDeleteTransactionCount(count)
    setDeletingAccount(account)
  }

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deletingAccount?.id) return

    const accountId = deletingAccount.id
    const accountBackup = { ...deletingAccount }
    const transactionsBackup = await transactionsApi.getAll({ accountId })

    // Clear any previous undo timeout
    if (undoRef.current) {
      clearTimeout(undoRef.current.timeoutId)
    }

    // Delete account and transactions atomically
    await transactionsApi.bulkDelete(transactionsBackup.map(t => t.id!))
    await accountsApi.delete(accountId)
    invalidateEntity('accounts', 'transactions')

    const handleUndo = async (): Promise<void> => {
      if (!undoRef.current) return
      clearTimeout(undoRef.current.timeoutId)
      await accountsApi.create({ ...undoRef.current.account })
      if (undoRef.current.transactions.length > 0) {
        await transactionsApi.bulkAdd(undoRef.current.transactions)
      }
      invalidateEntity('accounts', 'transactions')
      undoRef.current = null
      toast.success('Account restored')
    }

    const timeoutId = window.setTimeout(() => {
      undoRef.current = null
    }, 10000)

    undoRef.current = {
      account: accountBackup,
      transactions: transactionsBackup,
      timeoutId,
    }

    setDeletingAccount(null)

    toast('Account deleted', {
      description: `${accountBackup.name} and ${transactionsBackup.length} transactions removed.`,
      action: {
        label: 'Undo',
        onClick: handleUndo,
      },
      duration: 10000,
    })
  }

  if (accounts.length === 0) {
    return (
      <>
        <EmptyState
          icon={CreditCard}
          title="No accounts yet"
          description="Create your first bank account to start importing statements."
          actionLabel="Add Account"
          onAction={handleOpenCreate}
        />
        <CreateAccountModal open={createOpen} onOpenChange={setCreateOpen} />
      </>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Accounts</h2>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4" />
          Add Account
        </Button>
      </div>

      <div className="space-y-6">
        {accounts.map((account) => (
          <div key={account.id}>
            <AccountCard
              account={account}
              onEdit={handleEdit}
              onDelete={handleDeleteRequest}
            />
            {account.id !== undefined && (
              <AccountMonthGrid
                accountId={account.id}
                onMonthClick={handleMonthClick}
                onFileDropped={handleFileDropped}
              />
            )}
          </div>
        ))}
      </div>

      <CreateAccountModal open={createOpen} onOpenChange={setCreateOpen} />
      <EditAccountModal
        account={editingAccount}
        open={editingAccount !== null}
        onOpenChange={(open) => {
          if (!open) handleCloseEdit()
        }}
      />

      <AlertDialog
        open={deletingAccount !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingAccount(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingAccount?.name}"?
              This will also remove {deleteTransactionCount} {deleteTransactionCount === 1 ? 'transaction' : 'transactions'}.
              You can undo this action within 10 seconds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={reimportState !== null}
        onOpenChange={(open) => {
          if (!open) setReimportState(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace Existing Transactions</AlertDialogTitle>
            <AlertDialogDescription>
              This month already has {reimportState?.existingCount ?? 0}{' '}
              {reimportState?.existingCount === 1 ? 'transaction' : 'transactions'}.
              Replace them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReimport}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {importModalState && (
        <ImportCSVModal
          file={importModalState.file}
          accountId={importModalState.accountId}
          monthKey={importModalState.monthKey}
          open={importModalState !== null}
          onOpenChange={(open) => {
            if (!open) setImportModalState(null)
          }}
        />
      )}

      {pdfPreviewState && (
        <PDFImportPreview
          transactions={pdfPreviewState.transactions}
          accountId={pdfPreviewState.accountId}
          monthKey={pdfPreviewState.monthKey}
          open={pdfPreviewState !== null}
          onOpenChange={(open) => {
            if (!open) setPdfPreviewState(null)
          }}
        />
      )}

      <Dialog
        open={pdfParsingState !== null}
        onOpenChange={() => {}}
      >
        <DialogContent className="sm:max-w-md" hideCloseButton>
          <DialogHeader>
            <DialogTitle>Parsing Statement</DialogTitle>
            <DialogDescription>
              Extracting transactions from your PDF using AI...
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-8 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground">Parsing statement...</span>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={llmErrorState !== null}
        onOpenChange={(open) => {
          if (!open) setLlmErrorState(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>PDF Parsing Failed</DialogTitle>
            <DialogDescription>
              {llmErrorState?.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {(llmErrorState?.errorType === 'network' || llmErrorState?.errorType === 'timeout') && (
              <Button onClick={handleRetryPDF}>
                Retry
              </Button>
            )}
            <Button variant="outline" onClick={handleFallbackToCSV}>
              Import as CSV instead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={llmNotConfiguredState !== null}
        onOpenChange={(open) => {
          if (!open) setLlmNotConfiguredState(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>LLM Not Configured</DialogTitle>
            <DialogDescription>
              Set up an LLM to parse PDF statements. You can configure a local LLM (Ollama)
              or provide your own cloud API key in Settings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button onClick={() => {
              setLlmNotConfiguredState(null)
              navigate({ to: '/settings' })
            }}>
              <Settings className="h-4 w-4" />
              Go to Settings
            </Button>
            <Button variant="outline" onClick={handleFallbackToCSV}>
              Import as CSV instead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
