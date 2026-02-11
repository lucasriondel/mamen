import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { CategoryPicker } from '@/components/CategoryPicker'
import { useCategories } from '@/hooks/useCategories'
import { merchantsApi } from '@/lib/api'
import { toast } from 'sonner'
import { ChevronDown } from 'lucide-react'

export type EditMerchantModalProps = {
  isOpen: boolean
  onClose: () => void
  merchantId: number
  currentName: string
  currentCategoryId: number | undefined
}

export function EditMerchantModal({
  isOpen,
  onClose,
  merchantId,
  currentName,
  currentCategoryId,
}: EditMerchantModalProps): React.ReactElement {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined)
  const [isSaving, setIsSaving] = useState(false)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const { getCategoryById } = useCategories()

  useEffect(() => {
    if (isOpen) {
      setName(currentName)
      setCategoryId(currentCategoryId)
    }
  }, [isOpen, currentName, currentCategoryId])

  const hasChanges = name !== currentName || categoryId !== currentCategoryId
  const canSave = name.trim().length > 0 && hasChanges && !isSaving

  const handleSave = async (): Promise<void> => {
    if (!canSave) return
    setIsSaving(true)
    const prevName = currentName
    const prevCategoryId = currentCategoryId
    try {
      await merchantsApi.update(merchantId, {
        name: name.trim(),
        defaultCategoryId: categoryId,
      })
      toast('Merchant updated', {
        action: {
          label: 'Undo',
          onClick: () => {
            merchantsApi
              .update(merchantId, {
                name: prevName,
                defaultCategoryId: prevCategoryId,
              })
              .catch(() => {
                toast.error('Failed to undo merchant update')
              })
          },
        },
        duration: 10000,
      })
      onClose()
    } catch {
      toast.error('Failed to update merchant')
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && canSave) {
      e.preventDefault()
      handleSave()
    }
  }

  const selectedCategory =
    categoryId !== undefined ? getCategoryById(categoryId) : undefined

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[400px]"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle>Edit Merchant</DialogTitle>
          <DialogDescription>Update merchant name and default category</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="merchant-name">Name</Label>
            <Input
              id="merchant-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Merchant name"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Default Category</Label>
            <Popover
              open={categoryPickerOpen}
              onOpenChange={setCategoryPickerOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  role="combobox"
                  aria-expanded={categoryPickerOpen}
                >
                  {selectedCategory ? (
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: selectedCategory.color,
                        }}
                      />
                      {selectedCategory.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      No category
                    </span>
                  )}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0" align="start">
                <CategoryPicker
                  value={categoryId}
                  onSelect={(catId, subId) => {
                    setCategoryId(subId ?? catId)
                    setCategoryPickerOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
