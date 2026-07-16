import type { CategoryTreeNode } from "@mamen/shared";
import type { Category, CategoryId } from "@mamen/shared/contract";

/**
 * The category tree, owned in one place.
 *
 * The one-hop folder→children expansion used to live in five client surfaces
 * (the categories page, the category transactions page, the transactions
 * category picker, the issuer default-category picker, and the per-folder
 * totals). Five copies of a rule is how a rule gets half-applied — a missed copy
 * is silently wrong in one surface only (ADR 0003). This module is the single
 * caller-visible seam: descendant resolution, the folder/leaf split, tree
 * building for nested rendering, and path labels for parent pickers.
 *
 * The rollup is a real recursive descent (ADR 0003, issue #29): a folder's total
 * is the money on every leaf beneath it, at any depth, not one hop down. The
 * folder/leaf split still reads structure off `parentId === null`; flipping that
 * to childlessness so nested folders render is a separate change (issue #32).
 */

/** A folder paired with the leaves that sit beneath it, in tree order. */
export type FolderGroup = { folder: Category; leaves: Category[] };

/**
 * Group categories by `parentId`, each bucket in the list's order (roots under
 * the `null` key). The one adjacency map the recursive descents share, so both
 * read structure the same way.
 */
function childrenByParent(
	categories: readonly Category[],
): Map<number | null, Category[]> {
	const childrenOf = new Map<number | null, Category[]>();
	for (const cat of categories) {
		const bucket = childrenOf.get(cat.parentId) ?? [];
		bucket.push(cat);
		childrenOf.set(cat.parentId, bucket);
	}
	return childrenOf;
}

/**
 * A **Category folder** is structural, not assignable. Today that is exactly a
 * root (`parentId === null`); ADR 0003 flips this test to childlessness. Keep the
 * definition here so the flip is a one-line change, not a five-surface sweep.
 */
export function isFolder(category: Category): boolean {
	return category.parentId === null;
}

/** A **Category leaf** — assignable — is the complement of {@link isFolder}. */
export function isLeaf(category: Category): boolean {
	return !isFolder(category);
}

/**
 * Build the category forest: roots with their children nested, each node's
 * children in the list's order (the queries ask for `sortOrder`). The descent is
 * genuinely recursive, so it already handles any depth — the two-level data just
 * bottoms out after one hop. An orphan (a node whose parent is absent from the
 * list) is never reached from a root, so it is dropped rather than shown
 * rootless — this never invents structure.
 */
export function buildTree(categories: readonly Category[]): CategoryTreeNode[] {
	const childrenOf = childrenByParent(categories);
	const build = (parentId: number | null): CategoryTreeNode[] =>
		(childrenOf.get(parentId) ?? []).map((cat) => ({
			...cat,
			children: build(cat.id ?? null),
		}));
	return build(null);
}

/**
 * Every folder paired with its leaves, empty folders kept. The two-level view of
 * {@link buildTree}: a folder's children are its leaves.
 */
export function foldersWithLeaves(
	categories: readonly Category[],
): FolderGroup[] {
	return buildTree(categories).map((node) => ({
		folder: node,
		leaves: node.children,
	}));
}

/** Case-insensitive substring match of a category name against the query. */
function matches(name: string, query: string): boolean {
	return name.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * {@link foldersWithLeaves}, filtered to leaves whose name matches the query,
 * with folders left empty dropped. The shape the pickers render: folders are
 * headings only (a folder is not assignable), so an emptied one is noise.
 */
export function searchFolders(
	categories: readonly Category[],
	query: string,
): FolderGroup[] {
	return foldersWithLeaves(categories)
		.map(({ folder, leaves }) => ({
			folder,
			leaves: leaves.filter((leaf) => matches(leaf.name, query)),
		}))
		.filter((group) => group.leaves.length > 0);
}

/**
 * The assignable ids that roll up into a folder — every **leaf** beneath it, at
 * any depth, in tree order. A real recursive descent (ADR 0003): a folder's total
 * is the money on its whole subtree, so a leaf held three levels down counts just
 * as one held directly. The intermediate folders are skipped — they hold no money
 * of their own (assignability is childlessness), so a total is the sum over its
 * leaves alone, with nothing double-counted. A leaf or an unknown id has no
 * descendants and yields nothing. Callers pass this set to the transactions
 * `count`/`list` endpoints, which accept a set of category ids (ADR 0002) — one
 * id set, one query, no matter how deep the tree.
 */
export function descendantIds(
	categories: readonly Category[],
	folderId: number,
): CategoryId[] {
	const childrenOf = childrenByParent(categories);
	// A child with its own children is an intermediate folder — descend past it;
	// a childless child is a leaf — collect it.
	const collect = (id: number): CategoryId[] =>
		(childrenOf.get(id) ?? []).flatMap((child) =>
			childrenOf.has(child.id) ? collect(child.id) : [child.id],
		);
	return collect(folderId);
}

/**
 * The label for a node in a parent picker — its path from the root, joined with
 * a separator (e.g. `Food › Groceries`). Today every folder is a root, so a path
 * is a bare name; under nesting it disambiguates same-named leaves across
 * folders. Walks up the `parentId` chain, stopping at a root or a missing link.
 */
export function categoryPath(
	categories: readonly Category[],
	category: Category,
): string {
	const byId = new Map(categories.map((cat) => [cat.id, cat]));
	const names: string[] = [];
	let node: Category | undefined = category;
	while (node !== undefined) {
		names.unshift(node.name);
		node = node.parentId === null ? undefined : byId.get(node.parentId);
	}
	return names.join(" › ");
}
