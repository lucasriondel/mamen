import { useMemo } from 'react'
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
import { isMac } from '@/lib/utils/platform'

type CommandPaletteProps = Record<string, never>

export const CommandPalette = (_props: CommandPaletteProps): React.ReactElement => {
  const { isOpen, close } = useCommandPalette()
  const navigate = useNavigate()
  const modifierSymbol = useMemo(() => (isMac() ? '⌘' : 'Ctrl+'), [])

  const handleSelect = (action: () => void): void => {
    action()
    close()
  }

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close()
      }}
      showCloseButton={false}
    >
      <CommandInput placeholder="Search actions, pages..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

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
