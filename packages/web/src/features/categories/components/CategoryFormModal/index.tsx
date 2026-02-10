import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { updateCategorySchema, type UpdateCategoryInput } from '@/lib/schemas'
import { DEFAULT_COLOR, DEFAULT_ICON } from '../../lib/constants'
import { ColorPicker } from '../ColorPicker'
import { IconPicker } from '../IconPicker'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { CategoryTreeNode } from '@/types'

type CategoryFormModalProps = {
  mode: 'create' | 'edit'
  open: boolean
  onOpenChange: (open: boolean) => void
  parentId: number | null
  editNode?: CategoryTreeNode | null
  onCreate: (params: {
    name: string
    parentId: number | null
    color?: string
    icon?: string
  }) => Promise<number>
  onUpdate: (id: number, updates: UpdateCategoryInput) => Promise<void>
}

export function CategoryFormModal({
  mode,
  open,
  onOpenChange,
  parentId,
  editNode,
  onCreate,
  onUpdate,
}: CategoryFormModalProps): React.ReactElement {
  const form = useForm<UpdateCategoryInput>({
    resolver: zodResolver(updateCategorySchema),
    defaultValues: {
      name: '',
      color: DEFAULT_COLOR,
      icon: DEFAULT_ICON,
    },
  })

  useEffect(() => {
    if (mode === 'edit' && editNode) {
      form.reset({
        name: editNode.name,
        color: editNode.color,
        icon: editNode.icon,
      })
    } else if (mode === 'create') {
      form.reset({
        name: '',
        color: DEFAULT_COLOR,
        icon: DEFAULT_ICON,
      })
    }
  }, [mode, editNode, form])

  const handleSubmit = async (data: UpdateCategoryInput): Promise<void> => {
    if (mode === 'edit' && editNode?.id) {
      await onUpdate(editNode.id, data)
      toast.success('Category updated', {
        description: `"${data.name}" has been updated.`,
      })
    } else {
      await onCreate({
        name: data.name,
        parentId,
        color: data.color,
        icon: data.icon,
      })
      toast.success('Category created', {
        description: `"${data.name}" has been added.`,
      })
    }
    form.reset()
    onOpenChange(false)
  }

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      form.reset()
    }
    onOpenChange(nextOpen)
  }

  const isEdit = mode === 'edit'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Category' : 'Add Category'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the category details.'
              : parentId !== null
                ? 'Add a new subcategory.'
                : 'Add a new root category.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Groceries" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <ColorPicker value={field.value} onChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <IconPicker value={field.value} onChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">{isEdit ? 'Save Changes' : 'Add Category'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
