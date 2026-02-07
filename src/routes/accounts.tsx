import { useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CreditCard, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { db, useLiveQuery } from '@/lib/db'
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
import { AccountCard } from '@/features/accounts/components/AccountCard'
import { AccountMonthGrid } from '@/features/import/components/AccountMonthGrid'
import { ImportCSVModal } from '@/features/import/components/ImportCSVModal'
import { CreateAccountModal } from '@/features/accounts/components/CreateAccountModal'
import { EditAccountModal } from '@/features/accounts/components/EditAccountModal'
import { deleteTransactionsForMonth } from '@/features/import/services/csvImporter'
import type { Account } from '@/types'
import type { Transaction } from '@/types'

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
  const undoRef = useRef<UndoState | null>(null)
  const navigate = useNavigate()

  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []

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
    if (ext === 'csv') {
      setImportModalState({ file, monthKey, accountId })
    } else if (ext === 'pdf') {
      toast.info('PDF import coming in Story 2.5. Please use CSV for now.')
    } else {
      toast.error('Unsupported file type. Please upload a CSV or PDF file.')
    }
  }

  const handleConfirmReimport = async (): Promise<void> => {
    if (!reimportState) return
    const { file, monthKey, accountId } = reimportState
    await deleteTransactionsForMonth(accountId, monthKey)
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
    const count = await db.transactions.where('accountId').equals(account.id).count()
    setDeleteTransactionCount(count)
    setDeletingAccount(account)
  }

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deletingAccount?.id) return

    const accountId = deletingAccount.id
    const accountBackup = { ...deletingAccount }
    const transactionsBackup = await db.transactions
      .where('accountId')
      .equals(accountId)
      .toArray()

    // Clear any previous undo timeout
    if (undoRef.current) {
      clearTimeout(undoRef.current.timeoutId)
    }

    // Delete account and transactions atomically
    await db.transaction('rw', [db.accounts, db.transactions], async () => {
      await db.transactions.where('accountId').equals(accountId).delete()
      await db.accounts.delete(accountId)
    })

    const handleUndo = async (): Promise<void> => {
      if (!undoRef.current) return
      clearTimeout(undoRef.current.timeoutId)
      await db.accounts.add(undoRef.current.account)
      if (undoRef.current.transactions.length > 0) {
        await db.transactions.bulkAdd(undoRef.current.transactions)
      }
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
    </div>
  )
}
