import { MerchantsList } from '../MerchantsList'

export function MerchantsPage(): React.ReactElement {
  return (
    <div className="flex flex-col h-full -m-6">
      <div className="px-6 py-4 border-b">
        <h2 className="text-2xl font-bold">Merchants</h2>
      </div>
      <div className="flex-1 min-h-0">
        <MerchantsList />
      </div>
      <div className="flex justify-center gap-6 text-xs text-muted-foreground bg-background/80 backdrop-blur px-4 py-2 border-t">
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">J</kbd>
          /
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">K</kbd>
          {' '}Navigate
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Enter</kbd>
          {' '}Open
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd>
          {' '}Clear
        </span>
      </div>
    </div>
  )
}
