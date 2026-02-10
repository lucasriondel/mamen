import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Account } from '@/types'
import type { TransactionFilterValues } from '../../hooks/useTransactionFilters'

type AccountFilterProps = {
  filterValues: TransactionFilterValues
  accounts: Account[]
  onAccountIds: (ids: number[] | undefined) => void
  onClear: () => void
}

export function AccountFilter({ filterValues, accounts, onAccountIds, onClear }: AccountFilterProps) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(
    new Set(filterValues.accountIds ?? []),
  )

  const isActive = (filterValues.accountIds?.length ?? 0) > 0

  const toggleAccount = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleApply = () => {
    if (selected.size > 0) {
      onAccountIds(Array.from(selected))
    } else {
      onAccountIds(undefined)
    }
    setOpen(false)
  }

  const handleClear = () => {
    setSelected(new Set())
    onClear()
    setOpen(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSelected(new Set(filterValues.accountIds ?? []))
    }
    setOpen(next)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant={isActive ? 'default' : 'outline'} size="sm" className="h-8 gap-1.5 text-xs">
          <CreditCard className="h-3.5 w-3.5" />
          Account
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="start">
        <div className="flex flex-col gap-2">
          {accounts.map((account) => (
            <div key={account.id} className="flex items-center gap-2">
              <Checkbox
                id={`account-${account.id}`}
                checked={selected.has(account.id!)}
                onCheckedChange={() => toggleAccount(account.id!)}
              />
              <Label htmlFor={`account-${account.id}`} className="text-xs font-normal cursor-pointer">
                {account.name}
              </Label>
            </div>
          ))}
          {accounts.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 text-center">No accounts</p>
          )}
          <div className="flex justify-between border-t pt-2 mt-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClear}>
              Clear
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
