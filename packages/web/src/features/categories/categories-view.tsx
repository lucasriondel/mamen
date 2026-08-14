import type { CategoryTreeNode } from "@mamen/shared";
import type { Category, CategoryId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Empty } from "@/components/ui/empty";
import {
	buildTree,
	NEUTRAL_CATEGORY_COLOR,
	resolveCategoryColors,
	subtreeIds,
} from "@/lib/category-tree";
import { categoryQueries } from "@/lib/sdk";
import { categoryHoldsMoney } from "@/lib/sdk-error";
import { CategoriesTreeSkeleton } from "./categories-tree-skeleton";
import { CategoryParentPicker } from "./category-parent-picker";
import { CategoryRow } from "./category-row";
import { CategoryRowActions } from "./category-row-actions";
import { useCategoryMutations } from "./use-category-mutations";
import { useCategoryTotals } from "./use-category-totals";

/**
 * Which write dialog is open, and on what. `null` = closed. The categories page
 * uses a **modal** for its add/edit flows — there is no popover to live in here,
 * unlike the transaction cell's in-popover two-step (issue #26). Delete needs no
 * dialog: it is fired directly and, if refused, the API's `CategoryInUse` toast
 * names what depends on the category — more useful than a confirm.
 *
 * `create` carries an optional parent (`null` = a new root) — one gesture, not a
 * folder variant and a leaf variant (issue #32). `move` accepts any node, folder
 * or leaf.
 */
type Editor =
	| { kind: "create"; parent: Category | null }
	| { kind: "rename"; node: Category }
	| { kind: "move"; node: Category }
	| { kind: "spill"; node: Category; transactions: number; issuers: number };

const INPUT_CLASS =
	"rounded-full border border-gousse-line bg-gousse-bg px-4 py-2 text-gousse-ink text-sm outline-none focus:border-gousse-accent";

/** The per-node curation actions, threaded down the recursive render unchanged. */
interface NodeActions {
	onAdd: (parent: Category) => void;
	onRename: (node: Category) => void;
	onMove: (node: Category) => void;
	onDelete: (node: Category) => void;
	/** Store a new **Icon name** on a node (issue #58). */
	onIcon: (id: CategoryId, icon: string) => void;
	/** Store a colour, or `null` to resume inheriting (issue #58). */
	onColor: (id: CategoryId, color: string | null) => void;
	deleting: boolean;
	styling: boolean;
	/** Every node's **Category total** — its own leaves' net, at any depth. */
	totalById: Map<CategoryId, number>;
	/**
	 * Every node's **Resolved colour**, by node id. Resolved once against the flat
	 * list rather than per row: the walk needs the whole tree, and the recursive
	 * render only ever holds a subtree.
	 */
	colorById: Map<CategoryId, string>;
	/** Which folders are open. Absent = open: the tree starts fully expanded. */
	collapsed: ReadonlySet<CategoryId>;
	onToggle: (id: CategoryId) => void;
}

/**
 * Categories page (PRD #19, issues #26/#32). The one surface that **shapes the
 * tree** — nesting, re-parenting, and **Spill** — and the only one. Renders the
 * tree nested to whatever depth exists, each **Category folder** showing a
 * **Category total** that descends its whole subtree (#29). Curate it: create a
 * category (one gesture, optionally under a parent — its kind decided by what
 * ends up beneath it), rename anything, move any node to a different parent (its
 * subtree follows), and delete — the last guarded by the API. Every node stays
 * navigable (issue #25) — clicking a folder or leaf opens its transactions.
 */
export function CategoriesView() {
	const categoriesQuery = useQuery(
		categoryQueries.list({ limit: 200, orderBy: "sortOrder" }),
	);
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];
	const tree = buildTree(categories);

	const mutations = useCategoryMutations();
	const [editor, setEditor] = useState<Editor | null>(null);
	// Collapse is opt-in, so the tree lands fully expanded and the page still
	// answers "what is the shape of my spending?" without a single click.
	const [collapsed, setCollapsed] = useState<ReadonlySet<CategoryId>>(
		() => new Set(),
	);

	// A **Category total** for every node, folder and leaf alike — the signed net
	// over every leaf in its subtree (ADR 0003 / issue #29). See the hook for why
	// leaves cost a request each and what the batched fix would be.
	const totalById = useCategoryTotals(categories);

	// The **Resolved colour** of every node, folder and leaf alike. This is the
	// surface where inheritance is visible: recolour a folder and every descendant
	// that never stored a colour of its own repaints, because nothing here reads
	// `color` — it resolves (ADR 0006). Resolved for the whole flat list in one
	// pass, not per row: the walk needs the whole tree and the recursive render
	// only ever holds a subtree.
	const colorById = resolveCategoryColors(categories);

	const actions: NodeActions = {
		onAdd: (parent) => setEditor({ kind: "create", parent }),
		onRename: (node) => setEditor({ kind: "rename", node }),
		onMove: (node) => setEditor({ kind: "move", node }),
		onDelete: (node) => mutations.remove.mutate(node.id),
		onIcon: (id, icon) => mutations.setIcon.mutate({ id, icon }),
		onColor: (id, color) => mutations.setColor.mutate({ id, color }),
		deleting: mutations.remove.isPending,
		styling: mutations.setIcon.isPending || mutations.setColor.isPending,
		totalById,
		colorById,
		collapsed,
		onToggle: (id) =>
			setCollapsed((current) => {
				const next = new Set(current);
				if (!next.delete(id)) next.add(id);
				return next;
			}),
	};

	return (
		<section className="flex flex-col gap-6">
			<header className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-balance font-semibold text-2xl text-gousse-ink">
						Categories
					</h1>
					<p className="mt-1 text-gousse-muted">
						The shape of your spending, nested to any depth.
					</p>
				</div>
				<Button
					variant="primary"
					onClick={() => setEditor({ kind: "create", parent: null })}
				>
					New category
				</Button>
			</header>

			{categoriesQuery.isError ? (
				<Empty
					title="Couldn't load categories"
					description="Something went wrong reading your categories. Try again in a moment."
				/>
			) : categoriesQuery.isPending ? (
				<CategoriesTreeSkeleton />
			) : tree.length === 0 ? (
				<Empty
					title="No categories yet"
					description="Create a category to start shaping your spending."
				/>
			) : (
				<ul className="flex flex-col gap-3">
					{/* Only a **root** is a card. Nested folders are rows inside it —
					    every folder used to open its own bordered panel, so a
					    three-deep branch drew a box inside a box inside a box and the
					    chrome grew faster than the tree. */}
					{tree.map((node) => (
						<li
							key={node.id}
							className="overflow-hidden rounded-2xl border border-gousse-line bg-gousse-panel"
						>
							<CategoryNode node={node} depth={0} actions={actions} />
						</li>
					))}
				</ul>
			)}

			<CategoryEditorDialog
				editor={editor}
				categories={categories}
				onClose={() => setEditor(null)}
				onEditor={setEditor}
				mutations={mutations}
			/>
		</section>
	);
}

/**
 * One node, rendered by kind — the split is **childlessness, not root-ness** (ADR
 * 0003 / issue #32). Both kinds render through the same {@link CategoryRow}, so a
 * folder and a leaf cannot drift apart; the only difference is that a folder also
 * renders its children beneath it, to whatever depth, and can be collapsed.
 *
 * A nested folder is a **row**, not a nested panel. It keeps `role="group"`,
 * named by the row, so it still reads as a labelled group to a screen reader —
 * the semantics the old `fieldset`/`legend` pair carried, minus the box that made
 * a three-deep branch look like a stack of picture frames.
 */
function CategoryNode({
	node,
	depth,
	actions,
}: {
	node: CategoryTreeNode;
	depth: number;
	actions: NodeActions;
}) {
	const color = actions.colorById.get(node.id) ?? NEUTRAL_CATEGORY_COLOR;
	const total = actions.totalById.get(node.id) ?? 0;
	const isFolder = node.children.length > 0;
	const expanded = isFolder && !actions.collapsed.has(node.id);

	const row = (
		<CategoryRow
			node={node}
			depth={depth}
			color={color}
			total={total}
			share={shareOfParent(node, depth, actions)}
			childCount={node.children.length}
			expanded={expanded}
			onToggle={() => actions.onToggle(node.id)}
			onIcon={(icon) => actions.onIcon(node.id, icon)}
			onColor={(next) => actions.onColor(node.id, next)}
			styling={actions.styling}
			actions={
				<CategoryRowActions
					node={node}
					onAdd={actions.onAdd}
					onRename={actions.onRename}
					onMove={actions.onMove}
					onDelete={actions.onDelete}
					deleting={actions.deleting}
				/>
			}
		/>
	);

	if (!isFolder) return row;

	return (
		// Still a `fieldset` — it carries the implicit ARIA `group` role, so each
		// folder reads as a labelled group at any depth, exactly as before. What
		// changed is that it no longer *looks* like one: the border, radius and
		// padding are gone and the name comes from `aria-label` rather than a
		// `legend`, because a nested folder is a row now, not a panel. Keeping the
		// element keeps the semantics without the box-in-a-box.
		<fieldset className="min-w-0 border-0 p-0" aria-label={node.name}>
			{row}
			{expanded && (
				<ul>
					{node.children.map((child) => (
						<li key={child.id} className="border-gousse-line/45 border-t">
							<CategoryNode node={child} depth={depth + 1} actions={actions} />
						</li>
					))}
				</ul>
			)}
		</fieldset>
	);
}

/**
 * A row's share of its parent's total, `0`–`1` — what the bar draws. `null` for a
 * root (nothing to be a share *of*) and whenever the parent nets to zero, where
 * the ratio is undefined rather than full. Magnitudes, so a refund inside a
 * spending folder still reads as a fraction of it rather than a negative width.
 */
function shareOfParent(
	node: CategoryTreeNode,
	depth: number,
	actions: NodeActions,
): number | null {
	if (depth === 0 || node.parentId == null) return null;
	const parentTotal = actions.totalById.get(node.parentId);
	if (parentTotal === undefined || parentTotal === 0) return null;
	const own = actions.totalById.get(node.id) ?? 0;
	return Math.abs(own) / Math.abs(parentTotal);
}

interface CategoryEditorDialogProps {
	editor: Editor | null;
	categories: readonly Category[];
	onClose: () => void;
	onEditor: (editor: Editor) => void;
	mutations: ReturnType<typeof useCategoryMutations>;
}

/**
 * The single modal that hosts every add/edit flow, its content switched by the
 * open {@link Editor}. Each submit fires its mutation and closes on success; a
 * rejected write (a cycle, a name clash) surfaces as a toast from the mutation
 * hook and leaves the dialog open. The one exception is a refused **Kind flip**
 * (`CategoryHoldsMoney`): nesting under a money-holding leaf swaps the dialog to
 * the **Spill** step, where the user names the leaf the money moves into (#30).
 */
function CategoryEditorDialog({
	editor,
	categories,
	onClose,
	onEditor,
	mutations,
}: CategoryEditorDialogProps) {
	// The dialog's own node, so the move form's parent picker portals *inside* the
	// modal rather than to `document.body` — a modal neutralises the document
	// behind it, and a popover out there is a popover the dialog is entitled to
	// ignore (see the same guard in `category-create-dialog.tsx`).
	const [dialogNode, setDialogNode] = useState<HTMLDivElement | null>(null);

	return (
		<Dialog open={editor !== null} onOpenChange={(open) => !open && onClose()}>
			{/* Each form is a single labelled field, so no separate description. */}
			<DialogContent ref={setDialogNode}>
				{editor?.kind === "create" && (
					<NameForm
						title={
							editor.parent
								? `New category in ${editor.parent.name}`
								: "New category"
						}
						submitLabel="Create category"
						pending={mutations.create.isPending}
						onSubmit={(name) => {
							const parent = editor.parent;
							mutations.create.mutate(
								{ name, parentId: parent?.id ?? null },
								{
									onSuccess: onClose,
									// A refused Kind flip is not a dead end: swap to the spill
									// step so the money can move into a leaf the user names.
									onError: (error) => {
										const deps = categoryHoldsMoney(error);
										if (deps && parent) {
											onEditor({
												kind: "spill",
												node: parent,
												transactions: deps.transactions,
												issuers: deps.issuers,
											});
										}
									},
								},
							);
						}}
					/>
				)}
				{editor?.kind === "spill" && (
					<SpillForm
						node={editor.node}
						transactions={editor.transactions}
						issuers={editor.issuers}
						pending={mutations.spill.isPending}
						onSubmit={(name) =>
							mutations.spill.mutate(
								{ id: editor.node.id, name },
								{ onSuccess: onClose },
							)
						}
					/>
				)}
				{editor?.kind === "rename" && (
					<NameForm
						title={`Rename ${editor.node.name}`}
						submitLabel="Save"
						initial={editor.node.name}
						pending={mutations.rename.isPending}
						onSubmit={(name) =>
							mutations.rename.mutate(
								{ id: editor.node.id, name },
								{ onSuccess: onClose },
							)
						}
					/>
				)}
				{editor?.kind === "move" && (
					<MoveForm
						node={editor.node}
						categories={categories}
						pending={mutations.move.isPending}
						portalContainer={dialogNode}
						onSubmit={(parentId) =>
							mutations.move.mutate(
								{ id: editor.node.id, parentId },
								{ onSuccess: onClose },
							)
						}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** A one-field name form — create and rename share it. */
function NameForm({
	title,
	submitLabel,
	initial = "",
	pending,
	onSubmit,
}: {
	title: string;
	submitLabel: string;
	initial?: string;
	pending: boolean;
	onSubmit: (name: string) => void;
}) {
	const [name, setName] = useState(initial);
	const trimmed = name.trim();

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (trimmed.length === 0 || pending) return;
		onSubmit(trimmed);
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<DialogHeader>
				<DialogTitle>{title}</DialogTitle>
			</DialogHeader>
			<label className="flex flex-col gap-1 text-gousse-muted text-sm">
				Name
				<input
					className={INPUT_CLASS}
					value={name}
					onChange={(e) => setName(e.target.value)}
					aria-label="Category name"
				/>
			</label>
			<DialogFooter>
				<Button
					variant="primary"
					type="submit"
					disabled={pending || trimmed.length === 0}
				>
					{submitLabel}
				</Button>
			</DialogFooter>
		</form>
	);
}

/** Join a count list into prose: "40 transactions and 1 issuer default". */
function describeDependents(transactions: number, issuers: number): string {
	const parts: string[] = [];
	if (transactions > 0) {
		parts.push(`${transactions} transaction${transactions === 1 ? "" : "s"}`);
	}
	if (issuers > 0) {
		parts.push(`${issuers} issuer default${issuers === 1 ? "" : "s"}`);
	}
	if (parts.length === 0) return "money";
	if (parts.length === 1) return parts[0];
	return `${parts[0]} and ${parts[1]}`;
}

/**
 * The **Spill** step (issue #30): a leaf can't take a child while it still holds
 * money, so first move that money into a new child leaf the user names. Names
 * what depends on the node so the refusal is legible, then takes the one name —
 * never auto-filled, because the destination lives in the tree forever.
 */
function SpillForm({
	node,
	transactions,
	issuers,
	pending,
	onSubmit,
}: {
	node: Category;
	transactions: number;
	issuers: number;
	pending: boolean;
	onSubmit: (name: string) => void;
}) {
	const [name, setName] = useState("");
	const trimmed = name.trim();

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (trimmed.length === 0 || pending) return;
		onSubmit(trimmed);
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<DialogHeader>
				<DialogTitle>Spill {node.name}</DialogTitle>
			</DialogHeader>
			<p className="text-gousse-muted text-sm">
				{node.name} holds {describeDependents(transactions, issuers)}, so it
				can't take a child yet. Name a new category to move it into —{" "}
				{node.name} becomes a folder and nothing is stranded.
			</p>
			<label className="flex flex-col gap-1 text-gousse-muted text-sm">
				New category name
				<input
					className={INPUT_CLASS}
					value={name}
					onChange={(e) => setName(e.target.value)}
					aria-label="Spill category name"
				/>
			</label>
			<DialogFooter>
				<Button
					variant="primary"
					type="submit"
					disabled={pending || trimmed.length === 0}
				>
					Spill
				</Button>
			</DialogFooter>
		</form>
	);
}

/**
 * Move a node under a different parent — the target picked with the same
 * {@link CategoryParentPicker} the create flow uses, so "where does this sit" is
 * one gesture everywhere rather than a searchable tree in one dialog and a flat
 * `select` in another. Any node may be a parent (ADR 0003), which is what that
 * picker offers; the moved node's own subtree is subtracted here, since only this
 * caller knows which targets are illegal — a move under yourself or a descendant
 * is a cycle the API refuses. **Top level** promotes the node to a root.
 */
function MoveForm({
	node,
	categories,
	pending,
	onSubmit,
	portalContainer,
}: {
	node: Category;
	categories: readonly Category[];
	pending: boolean;
	onSubmit: (parentId: CategoryId | null) => void;
	/** The dialog's node — see {@link CategoryParentPicker}'s prop. */
	portalContainer?: HTMLElement | null;
}) {
	// Default to the node's current parent so a stray submit is a no-op, not a
	// move.
	const [target, setTarget] = useState<CategoryId | null>(node.parentId);

	const own = subtreeIds(categories, node.id);
	const targets = categories.filter((c) => !own.has(c.id));

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (pending) return;
		onSubmit(target);
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<DialogHeader>
				<DialogTitle>Move {node.name}</DialogTitle>
			</DialogHeader>
			<CategoryParentPicker
				categories={targets}
				value={target}
				onChange={setTarget}
				disabled={pending}
				portalContainer={portalContainer}
			/>
			<DialogFooter>
				<Button variant="primary" type="submit" disabled={pending}>
					Move
				</Button>
			</DialogFooter>
		</form>
	);
}
