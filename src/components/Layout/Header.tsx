import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Header(): React.ReactElement {
  return (
    <header className="flex items-center justify-between border-b px-6 h-14">
      <h1 className="text-lg font-semibold">mamen</h1>
      <Button
        variant="outline"
        className="w-64 justify-start text-muted-foreground"
        disabled
      >
        <Search className="mr-2 h-4 w-4" />
        Search...
        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
    </header>
  )
}
