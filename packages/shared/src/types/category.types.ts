import type { Category as ContractCategory } from "../contract";

export type Category = {
  id?: number;
  name: string;
  slug: string;
  /** null = **inherited colour** — see the contract {@link ContractCategory}. */
  color: string | null;
  icon: string;
  parentId: number | null;
  sortOrder: number;
  createdAt: Date;
};

export type CategoryWithSubcategories = Category & {
  subcategories: Category[];
};

/**
 * A node in the category forest: the wire {@link ContractCategory} with its
 * children nested. Built on the branded contract entity (not the loose legacy
 * {@link Category} above) so a node's `id`/`parentId` keep their `CategoryId`
 * brand — the web category-tree module hands these ids straight to the
 * transactions/count endpoints and to mutations, which demand the brand.
 */
export type CategoryTreeNode = ContractCategory & {
  children: CategoryTreeNode[];
};

export type CategorySelection = {
  categoryId: number;
  subcategoryId?: number;
};
