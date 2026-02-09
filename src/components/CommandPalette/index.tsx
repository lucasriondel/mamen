import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { useCommandPalette } from '@/context/CommandPaletteContext'
import { useFocusMode } from '@/context/FocusModeContext'
import { useTransactionSearch } from '@/features/search'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { isMac } from '@/lib/utils/platform'

type CommandPaletteProps = Record<string, never>

export const CommandPalette = (_props: CommandPaletteProps): React.ReactElement => {
  const { isOpen, close } = useCommandPalette()
  const navigate = useNavigate()
  const { setFocusMode, setAnomalyTypeFilter } = useFocusMode()
  const modifierSymbol = useMemo(() => (isMac() ? '⌘' : 'Ctrl+'), [])
  const [query, setQuery] = useState('')

  const { results: transactionResults } = useTransactionSearch(query)

  const handleSelect = (action: () => void): void => {
    action()
    close()
    setQuery('')
  }

  const handleTransactionSelect = (transactionId: number): void => {
    navigate({ to: '/transactions', search: { highlight: transactionId } })
    close()
    setQuery('')
  }

  const handleOpenChange = (open: boolean): void => {
    if (!open) {
      close()
      setQuery('')
    }
  }

  const hasQuery = query.trim().length > 0
  const resultCount = transactionResults.length

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      showCloseButton={false}
    >
      <CommandInput
        placeholder="Search transactions, merchants, actions..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results for &ldquo;{query}&rdquo;</CommandEmpty>

        {hasQuery && resultCount > 0 && (
          <>
            <CommandGroup heading="Transactions">
              {transactionResults.map((tx) => (
                <CommandItem
                  key={`tx-${tx.id}`}
                  value={`transaction-${tx.id}-${tx.rawMerchantString}`}
                  onSelect={() => handleTransactionSelect(tx.id)}
                >
                  <span className="text-muted-foreground text-xs w-16 shrink-0">
                    {tx.dateFormatted}
                  </span>
                  <span className="flex-1 truncate">{tx.rawMerchantString}</span>
                  <span className="font-mono text-xs shrink-0">
                    {formatCurrency(tx.amount)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {hasQuery && resultCount > 0 && (
          <div className="sr-only" role="status" aria-live="polite">
            {resultCount} result{resultCount !== 1 ? 's' : ''} for {query}
          </div>
        )}

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/accounts' }))}>
            Import statement
            <CommandShortcut>{modifierSymbol}I</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/transactions' }))}>
            View unmatched
            <CommandShortcut>U</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/transactions' }))}>
            View subscriptions
            <CommandShortcut>S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => {
            setFocusMode('anomalies')
            navigate({ to: '/transactions' })
          })}>
            Show anomalies
            <CommandShortcut>!</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => {
            setFocusMode('anomalies')
            setAnomalyTypeFilter('new-merchant')
            navigate({ to: '/transactions' })
          })}>
            Show new merchant transactions
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => {
            setFocusMode('anomalies')
            setAnomalyTypeFilter('high-amount')
            navigate({ to: '/transactions' })
          })}>
            Show high amount transactions
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => {
            setFocusMode('anomalies')
            setAnomalyTypeFilter('potential-duplicate')
            navigate({ to: '/transactions' })
          })}>
            Show potential duplicates
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/' }))}>
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/transactions' }))}>
            Transactions
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/merchants' }))}>
            Merchants
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/accounts' }))}>
            Accounts
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/settings' }))}>
            Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
