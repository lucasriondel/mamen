import type { CategoryTreeNode } from "@mamen/shared";
import type { Category, CategoryId } from "@mamen/shared/contract";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
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
	categoryPath,
	descendantIds,
	subtreeIds,
} from "@/lib/category-tree";
import { formatCurrency } from "@/lib/format";
import { categoryQueries, transactionQueries } from "@/lib/sdk";
import { categoryHoldsMoney } from "@/lib/sdk-error";
import { cn } from "@/lib/utils";
import { useCategoryMutations } from "./use-category-mutations";

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

const BUTTON_CLASS =
	"rounded-md border border-line px-2 py-1 text-muted text-xs transition-colors hover:border-accent hover:text-ink disabled:opacity-50";
const INPUT_CLASS =
	"rounded-md border border-line bg-bg px-3 py-2 text-ink text-sm outline-none focus:border-accent";
const PRIMARY_CLASS =
	"rounded-md bg-accent px-4 py-2 font-medium text-bg text-sm disabled:opacity-50";

/** The per-node curation actions, threaded down the recursive render unchanged. */
interface NodeActions {
	onAdd: (parent: Category) => void;
	onRename: (node: Category) => void;
	onMove: (node: Category) => void;
	onDelete: (id: CategoryId) => void;
	deleting: boolean;
	/** A folder's rolled-up **Category total** (whole subtree), by node id. */
	totalById: Map<CategoryId, number>;
}

/**
 * Every folder in a forest — a node with children — flattened depth-first, so a
 * total query can be spun up for each at any depth (issue #29/#32).
 */
function folderNodes(nodes: readonly CategoryTreeNode[]): CategoryTreeNode[] {
	return nodes.flatMap((node) =>
		node.children.length > 0 ? [node, ...folderNodes(node.children)] : [],
	);
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
	const folders = folderNodes(tree);

	const mutations = useCategoryMutations();
	const [editor, setEditor] = useState<Editor | null>(null);

	// A **Category total** per folder, at every depth: the signed net over every
	// leaf in its whole subtree (`descendantIds`, ADR 0003 / issue #29), from the
	// `count` endpoint (whole set, not a page). A folder with no leaves beneath it
	// has nothing to sum, so its query stays disabled.
	const totals = useQueries({
		queries: folders.map((folder) => {
			const ids = descendantIds(categories, folder.id);
			return {
				...transactionQueries.count({ categoryId: ids }),
				enabled: ids.length > 0,
			};
		}),
	});
	const totalById = new Map<CategoryId, number>(
		folders.map((folder, i) => [folder.id, totals[i]?.data?.total ?? 0]),
	);

	const actions: NodeActions = {
		onAdd: (parent) => setEditor({ kind: "create", parent }),
		onRename: (node) => setEditor({ kind: "rename", node }),
		onMove: (node) => setEditor({ kind: "move", node }),
		onDelete: (id) => mutations.remove.mutate(id),
		deleting: mutations.remove.isPending,
		totalById,
	};

	return (
		<section className="flex flex-col gap-6">
			<header className="flex items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl text-ink">Categories</h1>
					<p className="mt-1 text-muted">
						The shape of your spending, nested to any depth.
					</p>
				</div>
				<button
					type="button"
					className={PRIMARY_CLASS}
					onClick={() => setEditor({ kind: "create", parent: null })}
				>
					New category
				</button>
			</header>

			{categoriesQuery.isError ? (
				<Empty
					title="Couldn't load categories"
					description="Something went wrong reading your categories. Try again in a moment."
				/>
			) : categoriesQuery.isPending ? (
				<p className="py-16 text-center text-muted">Loading categories…</p>
			) : tree.length === 0 ? (
				<Empty
					title="No categories yet"
					description="Create a category to start shaping your spending."
				/>
			) : (
				<ul className="flex flex-col gap-6">
					{tree.map((node) => (
						<li key={node.id}>
							<CategoryNode node={node} actions={actions} />
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

/** The curation buttons shared by every node — add a child, rename, move, delete. */
function NodeControls({
	node,
	actions,
}: {
	node: Category;
	actions: NodeActions;
}) {
	return (
		<div className="flex shrink-0 flex-wrap gap-2">
			{/* Adding a child under a childless leaf is a **Kind flip**: it turns the
			    leaf into a folder. Refused while the leaf holds money — the view
			    answers with the Spill dialog (issue #30). */}
			<button
				type="button"
				className={BUTTON_CLASS}
				onClick={() => actions.onAdd(node)}
				aria-label={`Add category in ${node.name}`}
			>
				Add category
			</button>
			<button
				type="button"
				className={BUTTON_CLASS}
				onClick={() => actions.onRename(node)}
				aria-label={`Rename ${node.name}`}
			>
				Rename
			</button>
			<button
				type="button"
				className={BUTTON_CLASS}
				onClick={() => actions.onMove(node)}
				aria-label={`Move ${node.name}`}
			>
				Move
			</button>
			<button
				type="button"
				className={BUTTON_CLASS}
				onClick={() => actions.onDelete(node.id)}
				disabled={actions.deleting}
				aria-label={`Delete ${node.name}`}
			>
				Delete
			</button>
		</div>
	);
}

/** A link to a node's transactions page — its icon + name (issue #25). */
function NodeLink({ node, className }: { node: Category; className?: string }) {
	return (
		<Link
			to="/categories/$categoryId"
			params={{ categoryId: String(node.id) }}
			className={cn("flex min-w-0 items-center gap-1.5", className)}
		>
			<span aria-hidden>{node.icon}</span>
			<span className="truncate">{node.name}</span>
		</Link>
	);
}

/**
 * One node, rendered by kind — the split is **childlessness, not root-ness** (ADR
 * 0003 / issue #32). A folder (has children) is a labelled `group` with its
 * **Category total** and its children nested beneath it, to whatever depth. A
 * leaf (childless) is a single row. Both carry the same curation actions, so any
 * node can gain a child, be renamed, moved, or deleted.
 */
function CategoryNode({
	node,
	actions,
}: {
	node: CategoryTreeNode;
	actions: NodeActions;
}) {
	if (node.children.length === 0) {
		return (
			<div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-4 py-2">
				<NodeLink node={node} className="text-ink text-sm hover:text-accent" />
				<NodeControls node={node} actions={actions} />
			</div>
		);
	}

	const total = actions.totalById.get(node.id) ?? 0;
	return (
		// A `fieldset` carries the implicit ARIA `group` role, named by its
		// `legend` — the folder heading — so each folder reads as a labelled group.
		<fieldset className="rounded-lg border border-line bg-panel p-4">
			<legend className="flex w-full items-center justify-between gap-2">
				<NodeLink
					node={node}
					className="font-medium text-ink hover:text-accent"
				/>
				<output
					aria-label={`${node.name} total`}
					className={cn(
						"font-medium text-sm tabular-nums",
						total < 0 && "text-high",
						total > 0 && "text-low",
					)}
				>
					{formatCurrency(total)}
				</output>
			</legend>

			<div className="mt-3">
				<NodeControls node={node} actions={actions} />
			</div>

			<ul className="mt-3 flex flex-col gap-2 border-line border-l pl-3">
				{node.children.map((child) => (
					<li key={child.id}>
						<CategoryNode node={child} actions={actions} />
					</li>
				))}
			</ul>
		</fieldset>
	);
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
	return (
		<Dialog open={editor !== null} onOpenChange={(open) => !open && onClose()}>
			{/* Each form is a single labelled field, so no separate description. */}
			<DialogContent aria-describedby={undefined}>
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
			<label className="flex flex-col gap-1 text-muted text-sm">
				Name
				<input
					className={INPUT_CLASS}
					value={name}
					onChange={(e) => setName(e.target.value)}
					aria-label="Category name"
				/>
			</label>
			<DialogFooter>
				<button
					type="submit"
					className={PRIMARY_CLASS}
					disabled={pending || trimmed.length === 0}
				>
					{submitLabel}
				</button>
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
			<p className="text-muted text-sm">
				{node.name} holds {describeDependents(transactions, issuers)}, so it
				can't take a child yet. Name a new category to move it into —{" "}
				{node.name} becomes a folder and nothing is stranded.
			</p>
			<label className="flex flex-col gap-1 text-muted text-sm">
				New category name
				<input
					className={INPUT_CLASS}
					value={name}
					onChange={(e) => setName(e.target.value)}
					aria-label="Spill category name"
				/>
			</label>
			<DialogFooter>
				<button
					type="submit"
					className={PRIMARY_CLASS}
					disabled={pending || trimmed.length === 0}
				>
					Spill
				</button>
			</DialogFooter>
		</form>
	);
}

/**
 * Move a node under a different parent — the target picked from a `select`. Any
 * node may be a parent now (ADR 0003), so the picker offers **every** category,
 * rendered flat but **path-labelled** (`Life › Subscriptions`) rather than the
 * old lie of a bare root list (issue #32). The moved node's own subtree is
 * subtracted — a move under yourself or a descendant is a cycle the API refuses —
 * and a **Top level** option promotes the node to a root.
 */
function MoveForm({
	node,
	categories,
	pending,
	onSubmit,
}: {
	node: Category;
	categories: readonly Category[];
	pending: boolean;
	onSubmit: (parentId: CategoryId | null) => void;
}) {
	// Default to the node's current parent so a stray submit is a no-op, not a
	// move. "" is the sentinel for the Top level (no parent) option.
	const [target, setTarget] = useState<string>(String(node.parentId ?? ""));

	const own = subtreeIds(categories, node.id);
	const targets = categories.filter((c) => !own.has(c.id));

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (pending) return;
		onSubmit(target === "" ? null : (Number(target) as CategoryId));
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<DialogHeader>
				<DialogTitle>Move {node.name}</DialogTitle>
			</DialogHeader>
			<label className="flex flex-col gap-1 text-muted text-sm">
				Parent
				<select
					className={INPUT_CLASS}
					value={target}
					onChange={(e) => setTarget(e.target.value)}
					aria-label="Target parent"
				>
					<option value="">Top level (no parent)</option>
					{targets.map((parent) => (
						<option key={parent.id} value={String(parent.id)}>
							{categoryPath(categories, parent)}
						</option>
					))}
				</select>
			</label>
			<DialogFooter>
				<button type="submit" className={PRIMARY_CLASS} disabled={pending}>
					Move
				</button>
			</DialogFooter>
		</form>
	);
}
