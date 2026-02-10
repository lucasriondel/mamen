import { CategoryTreeNode } from '../CategoryTreeNode'
import type { CategoryTreeNode as CategoryTreeNodeType } from '@/types'

export type CategoryTreeProps = {
  tree: CategoryTreeNodeType[]
  onAddSubcategory: (parentId: number) => void
  onEdit: (node: CategoryTreeNodeType) => void
  onDelete: (node: CategoryTreeNodeType) => void
  onReorder: (id: number, direction: 'up' | 'down') => void
}

export function CategoryTree({
  tree,
  onAddSubcategory,
  onEdit,
  onDelete,
  onReorder,
}: CategoryTreeProps): React.ReactElement {
  if (tree.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No categories yet. Add one to get started.
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <CategoryTreeNode
          key={node.id}
          node={node}
          depth={0}
          onAddSubcategory={onAddSubcategory}
          onEdit={onEdit}
          onDelete={onDelete}
          onReorder={onReorder}
        />
      ))}
    </div>
  )
}
