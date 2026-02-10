import { useState, useCallback } from 'react'
import { Tag, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCategoryTree } from '../../hooks/useCategoryTree'
import { useCategoryMutations } from '../../hooks/useCategoryMutations'
import { CategoryTree } from '../CategoryTree'
import { CategoryFormModal } from '../CategoryFormModal'
import { DeleteCategoryDialog } from '../DeleteCategoryDialog'
import type { CategoryTreeNode } from '@/types'

type ModalState =
  | { type: 'closed' }
  | { type: 'create'; parentId: number | null }
  | { type: 'edit'; node: CategoryTreeNode }

type DeleteState =
  | { type: 'closed' }
  | { type: 'confirm'; node: CategoryTreeNode }

export function CategoriesPage(): React.ReactElement {
  const { tree } = useCategoryTree()
  const { createCategory, updateCategory, deleteCategory, reorder } =
    useCategoryMutations()

  const [modal, setModal] = useState<ModalState>({ type: 'closed' })
  const [deleteState, setDeleteState] = useState<DeleteState>({ type: 'closed' })

  const handleAddRoot = useCallback(() => {
    setModal({ type: 'create', parentId: null })
  }, [])

  const handleAddSubcategory = useCallback((parentId: number) => {
    setModal({ type: 'create', parentId })
  }, [])

  const handleEdit = useCallback((node: CategoryTreeNode) => {
    setModal({ type: 'edit', node })
  }, [])

  const handleDelete = useCallback((node: CategoryTreeNode) => {
    setDeleteState({ type: 'confirm', node })
  }, [])

  const handleModalOpenChange = useCallback((open: boolean) => {
    if (!open) setModal({ type: 'closed' })
  }, [])

  const handleDeleteOpenChange = useCallback((open: boolean) => {
    if (!open) setDeleteState({ type: 'closed' })
  }, [])

  return (
    <div className="flex flex-col h-full -m-6">
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Tag className="h-6 w-6" />
            <div>
              <h2 className="text-2xl font-bold">Categories</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Organize your transactions with categories
              </p>
            </div>
          </div>
          <Button onClick={handleAddRoot} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Category
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <CategoryTree
          tree={tree}
          onAddSubcategory={handleAddSubcategory}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onReorder={reorder}
        />
      </div>

      <CategoryFormModal
        mode={modal.type === 'edit' ? 'edit' : 'create'}
        open={modal.type !== 'closed'}
        onOpenChange={handleModalOpenChange}
        parentId={modal.type === 'create' ? modal.parentId : null}
        editNode={modal.type === 'edit' ? modal.node : null}
        onCreate={createCategory}
        onUpdate={updateCategory}
      />

      <DeleteCategoryDialog
        node={deleteState.type === 'confirm' ? deleteState.node : null}
        open={deleteState.type === 'confirm'}
        onOpenChange={handleDeleteOpenChange}
        onConfirm={deleteCategory}
      />
    </div>
  )
}
