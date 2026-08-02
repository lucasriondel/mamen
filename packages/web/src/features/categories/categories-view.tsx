import type { CategoryTreeNode } from "@mamen/shared";
import type { Category, CategoryId } from "@mamen/shared/contract";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ColorPicker } from "@/components/color-picker";
import { IconPicker } from "@/components/icon-picker";
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
	descendantIds,
	NEUTRAL_CATEGORY_COLOR,
	resolveCategoryColors,
	subtreeIds,
} from "@/lib/category-tree";
import { formatCurrency } from "@/lib/format";
import { categoryQueries, transactionQueries } from "@/lib/sdk";
import { categoryHoldsMoney } from "@/lib/sdk-error";
import { cn } from "@/lib/utils";
import { CategoryParentPicker } from "./category-parent-picker";
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

const INPUT_CLASS =
	"rounded-md border border-gousse-line bg-gousse-bg px-3 py-2 text-gousse-ink text-sm outline-none focus:border-gousse-accent";

/** The per-node curation actions, threaded down the recursive render unchanged. */
interface NodeActions {
	onAdd: (parent: Category) => void;
	onRename: (node: Category) => void;
	onMove: (node: Category) => void;
	onDelete: (id: CategoryId) => void;
	/** Store a new **Icon name** on a node (issue #58). */
	onIcon: (id: CategoryId, icon: string) => void;
	/** Store a colour, or `null` to resume inheriting (issue #58). */
	onColor: (id: CategoryId, color: string | null) => void;
	deleting: boolean;
	styling: boolean;
	/** A folder's rolled-up **Category total** (whole subtree), by node id. */
	totalById: Map<CategoryId, number>;
	/**
	 * Every node's **Resolved colour**, by node id. Resolved once against the flat
	 * list rather than per row: the walk needs the whole tree, and the recursive
	 * render only ever holds a subtree.
	 */
	colorById: Map<CategoryId, string>;
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
		onDelete: (id) => mutations.remove.mutate(id),
		onIcon: (id, icon) => mutations.setIcon.mutate({ id, icon }),
		onColor: (id, color) => mutations.setColor.mutate({ id, color }),
		deleting: mutations.remove.isPending,
		styling: mutations.setIcon.isPending || mutations.setColor.isPending,
		totalById,
		colorById,
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
				<p className="py-16 text-center text-gousse-muted">
					Loading categories…
				</p>
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
			<Button
				variant="secondary"
				size="sm"
				onClick={() => actions.onAdd(node)}
				aria-label={`Add category in ${node.name}`}
			>
				Add category
			</Button>
			<Button
				variant="secondary"
				size="sm"
				onClick={() => actions.onRename(node)}
				aria-label={`Rename ${node.name}`}
			>
				Rename
			</Button>
			<Button
				variant="secondary"
				size="sm"
				onClick={() => actions.onMove(node)}
				aria-label={`Move ${node.name}`}
			>
				Move
			</Button>
			<Button
				variant="secondary"
				size="sm"
				onClick={() => actions.onDelete(node.id)}
				disabled={actions.deleting}
				aria-label={`Delete ${node.name}`}
			>
				Delete
			</Button>
		</div>
	);
}

/**
 * A node's identity on the row: its icon chip, its colour swatch, and a link to
 * its transactions page (issue #25).
 *
 * The chip and the swatch are the **editors** for what they show (issue #58) —
 * click the icon to change the icon, click the swatch to change the colour —
 * rather than fields folded into the rename/move dialogs, which stay
 * single-purpose. That is also why they sit *outside* the link: nesting a button
 * inside an anchor is invalid, and one gesture can't mean both "navigate" and
 * "edit".
 *
 * Both are drawn in the node's **Resolved colour**, never its stored `color`, so
 * a leaf that inherits visibly tracks the folder above it and a folder recolour
 * repaints its whole subtree on the next read (ADR 0006).
 */
function NodeIdentity({
	node,
	color,
	actions,
	className,
}: {
	node: Category;
	color: string;
	actions: NodeActions;
	className?: string;
}) {
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			<IconPicker
				label={node.name}
				value={node.icon}
				color={color}
				pending={actions.styling}
				onSelect={(icon) => actions.onIcon(node.id, icon)}
			/>
			<ColorPicker
				label={node.name}
				value={node.color}
				resolved={color}
				pending={actions.styling}
				onSubmit={(next) => actions.onColor(node.id, next)}
			/>
			<Link
				to="/categories/$categoryId"
				params={{ categoryId: String(node.id) }}
				className={cn("min-w-0 truncate", className)}
			>
				{node.name}
			</Link>
		</span>
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
	const color = actions.colorById.get(node.id) ?? NEUTRAL_CATEGORY_COLOR;

	if (node.children.length === 0) {
		return (
			<div className="flex items-center justify-between gap-2 rounded-lg border border-gousse-line bg-gousse-panel px-4 py-2">
				<NodeIdentity
					node={node}
					color={color}
					actions={actions}
					className="text-gousse-ink text-sm hover:text-gousse-accent"
				/>
				<NodeControls node={node} actions={actions} />
			</div>
		);
	}

	const total = actions.totalById.get(node.id) ?? 0;
	return (
		// A `fieldset` carries the implicit ARIA `group` role, named by its
		// `legend` — the folder heading — so each folder reads as a labelled group.
		<fieldset className="rounded-lg border border-gousse-line bg-gousse-panel p-4">
			<legend className="flex w-full items-center justify-between gap-2">
				<NodeIdentity
					node={node}
					color={color}
					actions={actions}
					className="font-medium text-gousse-ink hover:text-gousse-accent"
				/>
				<output
					aria-label={`${node.name} total`}
					className={cn(
						"font-medium text-sm tabular-nums",
						total < 0 && "text-gousse-high",
						total > 0 && "text-gousse-low",
					)}
				>
					{formatCurrency(total)}
				</output>
			</legend>

			<div className="mt-3">
				<NodeControls node={node} actions={actions} />
			</div>

			<ul className="mt-3 flex flex-col gap-2 border-gousse-line border-l pl-3">
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
	// The dialog's own node, so the move form's parent picker portals *inside* the
	// modal. A Radix modal locks scrolling outside its subtree, so a popover
	// portalled to `document.body` renders and clicks but never takes the wheel.
	const [dialogNode, setDialogNode] = useState<HTMLDivElement | null>(null);

	return (
		<Dialog open={editor !== null} onOpenChange={(open) => !open && onClose()}>
			{/* Each form is a single labelled field, so no separate description. */}
			<DialogContent aria-describedby={undefined} ref={setDialogNode}>
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
