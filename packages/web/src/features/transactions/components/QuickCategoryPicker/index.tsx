import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useCategories } from '@/hooks/useCategories'
import { ChevronRight } from 'lucide-react'

export type QuickCategoryPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCategorySelect: (categoryId: number, subcategoryId?: number) => void
  batchCount?: number
}

export function QuickCategoryPicker({
  open,
  onOpenChange,
  onCategorySelect,
  batchCount,
}: QuickCategoryPickerProps): React.ReactElement {
  const { categoriesWithSubs, parentCategories } = useCategories()
  const isBatchMode = batchCount !== undefined && batchCount > 1

  const handleSelect = (categoryId: number, subcategoryId?: number): void => {
    onCategorySelect(categoryId, subcategoryId)
    onOpenChange(false)
  }

  const hasCategories = parentCategories.length > 0

  const title = isBatchMode
    ? `Categorize ${batchCount} transactions`
    : 'Assign Category'
  const description = isBatchMode
    ? `Select a category for ${batchCount} transactions`
    : 'Search and select a category for this transaction'

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      showCloseButton={false}
    >
      <CommandInput
        placeholder="Search categories..."
        aria-label="Search categories"
      />
      <CommandList>
        <CommandEmpty>
          {hasCategories
            ? 'No categories match your search.'
            : 'No categories available. Set up categories first.'}
        </CommandEmpty>

        {categoriesWithSubs.map((parent) => (
          <CommandGroup key={parent.id} heading={parent.name}>
            <CommandItem
              value={`${parent.name} (general)`}
              onSelect={() => handleSelect(parent.id!)}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: parent.color }}
                aria-hidden="true"
              />
              <span>{parent.name}</span>
              <span className="text-muted-foreground text-xs ml-auto">General</span>
            </CommandItem>
            {parent.subcategories.map((sub) => (
              <CommandItem
                key={sub.id}
                value={`${parent.name} ${sub.name}`}
                onSelect={() => handleSelect(parent.id!, sub.id!)}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: sub.color }}
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">{parent.name}</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <span>{sub.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
