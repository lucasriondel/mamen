import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
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
import { CreateAccountModal } from '@/features/accounts/components/CreateAccountModal'
import { EditAccountModal } from '@/features/accounts/components/EditAccountModal'
import type { Account } from '@/types'
import type { Transaction } from '@/types'

type UndoState = {
  account: Account
  transactions: Transaction[]
  timeoutId: number
}

export const Route = createFileRoute('/accounts')({
  component: AccountsPage,
})

export function AccountsPage(): React.ReactElement {
  const [createOpen, setCreateOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null)
  const [deleteTransactionCount, setDeleteTransactionCount] = useState(0)
  const undoRef = useRef<UndoState | null>(null)

  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []

  const handleOpenCreate = (): void => {
    setCreateOpen(true)
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            onEdit={handleEdit}
            onDelete={handleDeleteRequest}
          />
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
    </div>
  )
}
