import type { CategoryTreeNode } from "@mamen/shared";
import type { Category, CategoryId } from "@mamen/shared/contract";
import { indexById } from "@/lib/utils";

/**
 * The category tree, owned in one place.
 *
 * The one-hop folder→children expansion used to live in five client surfaces
 * (the categories page, the category transactions page, the transactions
 * category picker, the issuer default-category picker, and the per-folder
 * totals). Five copies of a rule is how a rule gets half-applied — a missed copy
 * is silently wrong in one surface only (ADR 0003). This module is the single
 * caller-visible seam: descendant resolution, the folder/leaf split, tree
 * building for nested rendering, the DFS flatten the pickers render
 * ({@link searchTree}), and path labels for parent pickers.
 *
 * The rollup is a real recursive descent (ADR 0003, issue #29): a folder's total
 * is the money on every leaf beneath it, at any depth, not one hop down. The
 * folder/leaf split reads **childlessness**, not root-ness (issue #32): a node
 * with children is a folder, a childless node is a leaf, at any depth — so a
 * nested folder renders as a folder and an empty root renders as an assignable
 * leaf.
 */

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
 * A **Category folder** is structural, not assignable — and under ADR 0003 that
 * is decided by **childlessness, not root-ness**: a node is a folder iff
 * something hangs beneath it. Not `parentId === null` — that proxy held only in
 * the two-level world and silently mislabels both a nested folder (a non-root
 * with children) and an empty root (a childless node that is really an
 * assignable leaf). Needs the whole list to probe for children, so the check
 * lives beside the tree it reads.
 */
export function isFolder(
	categories: readonly Category[],
	category: Category,
): boolean {
	return categories.some((c) => c.parentId === category.id);
}

/** A **Category leaf** — assignable — is the complement of {@link isFolder}. */
export function isLeaf(
	categories: readonly Category[],
	category: Category,
): boolean {
	return !isFolder(categories, category);
}

/**
 * Build the category forest: roots with their children nested, each node's
 * children in the list's order (the queries ask for `sortOrder`). The descent is
 * genuinely recursive, so it handles any depth (issue #32); a flat two-level tree
 * simply bottoms out after one hop. An orphan (a node whose parent is absent from
 * the
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

/** Case-insensitive substring match of a category name against the query. */
function matches(name: string, query: string): boolean {
	return name.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * A category positioned for nested picker rendering: its **depth** from the root
 * and whether it is an assignable **leaf** (childless) or a heading **folder**.
 */
export type PickerNode = { category: Category; depth: number; isLeaf: boolean };

/**
 * The tree flattened to one DFS-ordered list a picker renders directly, filtered
 * to the query. Every childless category is a selectable **leaf** — at any depth
 * (ADR 0003), so an empty root is assignable too — kept iff its own name matches.
 * Every folder is an unselectable **heading**, kept iff a leaf beneath it (at any
 * depth) matches, so an emptied branch is dropped as noise; the surviving
 * ancestors stay as context. `depth` drives indentation, so the pickers read the
 * nesting without nested groups — cmdk navigates the flat leaf items and steps
 * over the folder headings, which are not items. Supersedes the old two-level
 * folder grouping the pickers used, which only ever saw one hop of nesting.
 */
export function searchTree(
	categories: readonly Category[],
	query: string,
): PickerNode[] {
	const walk = (nodes: CategoryTreeNode[], depth: number): PickerNode[] => {
		const out: PickerNode[] = [];
		for (const { children, ...category } of nodes) {
			if (children.length > 0) {
				const inner = walk(children, depth + 1);
				// A folder earns its heading only when something under it survived.
				if (inner.length > 0) {
					out.push({ category, depth, isLeaf: false });
					out.push(...inner);
				}
			} else if (matches(category.name, query)) {
				out.push({ category, depth, isLeaf: true });
			}
		}
		return out;
	};
	return walk(buildTree(categories), 0);
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
 * Every id in a node's subtree, the node itself included. A re-parent picker
 * subtracts this set from its target list so it never offers the moved node or
 * anything beneath it — a move under your own descendant is a cycle the API
 * refuses (`CategoryWouldCycle`), so pre-empting it keeps the picker honest.
 * Unlike {@link descendantIds} this keeps the intermediate folders, since those
 * are exactly the illegal targets.
 */
export function subtreeIds(
	categories: readonly Category[],
	rootId: number,
): Set<CategoryId> {
	const childrenOf = childrenByParent(categories);
	const ids = new Set<CategoryId>();
	const walk = (id: number): void => {
		ids.add(id as CategoryId);
		for (const child of childrenOf.get(id) ?? []) walk(child.id);
	};
	walk(rootId);
	return ids;
}

/**
 * The colour painted when the **inherited colour** walk finds nobody who ever
 * chose one: a null root, or a detached node whose parent is missing from the
 * list. Neutral slate — the grey `use-category-mutations` used to stamp onto
 * every new category, now the terminator of a walk instead of a stored value, so
 * a category that inherits nothing looks exactly as it did before (ADR 0006).
 */
export const NEUTRAL_CATEGORY_COLOR = "#94a3b8";

/**
 * The one `parentId` walk both colour resolution and {@link categoryPath} read
 * the tree through: a category's ancestors, nearest first.
 *
 * Total for every tree shape. It stops at a root, at a parent absent from the
 * list (a detached node — never invents structure, exactly as {@link buildTree}
 * drops orphans), and at a revisited id, so a cycle the API would refuse
 * (`CategoryWouldCycle`) cannot hang a render. One walk rather than two is the
 * point: two copies of a termination rule is how one of them ends up missing a
 * guard the other has.
 */
function* ancestorsOf(
	byId: ReadonlyMap<number, Category>,
	category: Category,
): Generator<Category> {
	const seen = new Set<number>([category.id]);
	let parentId = category.parentId;
	while (parentId != null && !seen.has(parentId)) {
		seen.add(parentId);
		const parent = byId.get(parentId);
		if (parent === undefined) return;
		yield parent;
		parentId = parent.parentId;
	}
}

/**
 * The colour a row actually *chose*, or `null` if it never did and therefore
 * **inherits**.
 *
 * Neither the contract (`Schema.NullOr(Schema.String)`) nor the column
 * constrains the string, so "stored a colour" cannot be read as "is not null":
 * `""` is storable and would otherwise terminate the walk and reach the svg as
 * `stroke=""`, blanking the glyph — and, on a folder, every descendant
 * inheriting from it. Blank is not a choice, so it inherits like the null it
 * effectively is.
 */
function chosenColor(category: Category): string | null {
	const color = category.color?.trim();
	return color === undefined || color === "" ? null : color;
}

/** The first colour anybody in the ancestry chose, else the neutral constant. */
function inheritedColor(
	byId: ReadonlyMap<number, Category>,
	category: Category,
): string {
	for (const ancestor of ancestorsOf(byId, category)) {
		const chosen = chosenColor(ancestor);
		if (chosen !== null) return chosen;
	}
	return NEUTRAL_CATEGORY_COLOR;
}

/**
 * A category's **Resolved colour** — the colour actually painted for it. Its own
 * `color` if it stored one; otherwise its nearest ancestor's, found by walking
 * `parentId` up to the first stored value; otherwise
 * {@link NEUTRAL_CATEGORY_COLOR}.
 *
 * `color: null` is **inherited colour**: a *reference* to the ancestor, not a
 * missing value (ADR 0006). That is what makes one write on a **Category folder**
 * recolour every descendant that never opted out — so no read site may read the
 * field, and resolution needs the whole tree rather than one row.
 *
 * Resolving *one* category costs an index over the whole list, so a caller with
 * a list of them wants {@link resolveCategoryColors}, which builds that index
 * once. This single-node form is for the surfaces that paint exactly one.
 */
export function resolveCategoryColor(
	categories: readonly Category[],
	category: Category,
): string {
	return (
		chosenColor(category) ?? inheritedColor(indexById(categories), category)
	);
}

/**
 * Every category's **Resolved colour**, keyed by id — the batch form of
 * {@link resolveCategoryColor}, and what every surface that paints a *list* of
 * categories should call.
 *
 * The index the walk needs is built once for the whole list rather than once per
 * category, so this is a single pass where a `map` of the single-node resolver
 * would be quadratic. Rows the pickers filter out still have to be *passed in*:
 * an inheriting leaf's colour lives on an ancestor that the filter may well have
 * dropped.
 */
export function resolveCategoryColors(
	categories: readonly Category[],
): Map<CategoryId, string> {
	const byId = indexById(categories);
	return new Map(
		categories.map((cat) => [
			cat.id,
			chosenColor(cat) ?? inheritedColor(byId, cat),
		]),
	);
}

/**
 * The label for a node in a parent picker — its path from the root, joined with
 * a separator (e.g. `Food › Groceries`). A root's path is a bare name; a nested
 * node's path spells out its ancestry, disambiguating same-named nodes across
 * folders (issue #32). Reads the tree through {@link ancestorsOf}, so it stops
 * at a root, a missing link, or a cycle.
 */
export function categoryPath(
	categories: readonly Category[],
	category: Category,
): string {
	const names = [category.name];
	for (const ancestor of ancestorsOf(indexById(categories), category)) {
		names.unshift(ancestor.name);
	}
	return names.join(" › ");
}
