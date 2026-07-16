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
	categoryPath,
	descendantIds,
	foldersWithLeaves,
} from "@/lib/category-tree";
import { formatCurrency } from "@/lib/format";
import { categoryQueries, transactionQueries } from "@/lib/sdk";
import { cn } from "@/lib/utils";
import { useCategoryMutations } from "./use-category-mutations";

/**
 * Which write dialog is open, and on what. `null` = closed. The categories page
 * uses a **modal** for its add/edit flows — there is no popover to live in here,
 * unlike the transaction cell's in-popover two-step (issue #26). Delete needs no
 * dialog: it is fired directly and, if refused, the API's `CategoryInUse` toast
 * names what depends on the category — more useful than a confirm.
 */
type Editor =
	| { kind: "createFolder" }
	| { kind: "createLeaf"; parent: Category }
	| { kind: "rename"; node: Category }
	| { kind: "move"; leaf: Category };

const BUTTON_CLASS =
	"rounded-md border border-line px-2 py-1 text-muted text-xs transition-colors hover:border-accent hover:text-ink disabled:opacity-50";
const INPUT_CLASS =
	"rounded-md border border-line bg-bg px-3 py-2 text-ink text-sm outline-none focus:border-accent";
const PRIMARY_CLASS =
	"rounded-md bg-accent px-4 py-2 font-medium text-bg text-sm disabled:opacity-50";

/**
 * Categories page (PRD #19, issue #26). Lists the two-level tree and lets you
 * **curate** it: create a folder, create a leaf inside one, rename anything, move
 * a leaf to a different folder (its transactions follow), and delete — the last
 * one guarded by the API. Each **Category folder** shows a **Category total** —
 * the signed net sum of its leaves' transactions, with nothing double-counted
 * (a folder holds no transactions of its own). Every node stays navigable
 * (issue #25) — clicking a folder or leaf opens its transactions.
 */
export function CategoriesView() {
	const categoriesQuery = useQuery(
		categoryQueries.list({ limit: 200, orderBy: "sortOrder" }),
	);
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];
	const groups = foldersWithLeaves(categories);

	const mutations = useCategoryMutations();
	const [editor, setEditor] = useState<Editor | null>(null);

	// A **Category total** per folder: the signed net over every leaf in its whole
	// subtree, at any depth (`descendantIds`, ADR 0003 / issue #29), from the
	// `count` endpoint (whole set, not a page). A folder with no leaves beneath it
	// has nothing to sum, so its query stays disabled.
	const totals = useQueries({
		queries: groups.map(({ folder }) => {
			const ids = descendantIds(categories, folder.id);
			return {
				...transactionQueries.count({ categoryId: ids }),
				enabled: ids.length > 0,
			};
		}),
	});

	return (
		<section className="flex flex-col gap-6">
			<header className="flex items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl text-ink">Categories</h1>
					<p className="mt-1 text-muted">
						The shape of your spending, grouped into folders.
					</p>
				</div>
				<button
					type="button"
					className={PRIMARY_CLASS}
					onClick={() => setEditor({ kind: "createFolder" })}
				>
					New folder
				</button>
			</header>

			{categoriesQuery.isError ? (
				<Empty
					title="Couldn't load categories"
					description="Something went wrong reading your categories. Try again in a moment."
				/>
			) : categoriesQuery.isPending ? (
				<p className="py-16 text-center text-muted">Loading categories…</p>
			) : groups.length === 0 ? (
				<Empty
					title="No categories yet"
					description="Create a folder to start shaping your spending."
				/>
			) : (
				<div className="flex flex-col gap-6">
					{groups.map(({ folder, leaves }, i) => (
						<FolderCard
							key={folder.id}
							folder={folder}
							leaves={leaves}
							total={totals[i]?.data?.total ?? 0}
							onAddLeaf={() =>
								setEditor({ kind: "createLeaf", parent: folder })
							}
							onRename={(node) => setEditor({ kind: "rename", node })}
							onMove={(leaf) => setEditor({ kind: "move", leaf })}
							onDelete={(id) => mutations.remove.mutate(id)}
							deleting={mutations.remove.isPending}
						/>
					))}
				</div>
			)}

			<CategoryEditorDialog
				editor={editor}
				folders={groups.map((g) => g.folder)}
				onClose={() => setEditor(null)}
				mutations={mutations}
			/>
		</section>
	);
}

interface FolderCardProps {
	folder: Category;
	leaves: Category[];
	total: number;
	onAddLeaf: () => void;
	onRename: (node: Category) => void;
	onMove: (leaf: Category) => void;
	onDelete: (id: CategoryId) => void;
	deleting: boolean;
}

/** One folder: its heading + total, its curation actions, and its leaf rows. */
function FolderCard({
	folder,
	leaves,
	total,
	onAddLeaf,
	onRename,
	onMove,
	onDelete,
	deleting,
}: FolderCardProps) {
	return (
		// A `fieldset` carries the implicit ARIA `group` role, named by its
		// `legend` — the folder heading — so each folder reads as a labelled group.
		<fieldset className="rounded-lg border border-line bg-panel p-4">
			<legend className="flex w-full items-center justify-between gap-2">
				<Link
					to="/categories/$categoryId"
					params={{ categoryId: String(folder.id) }}
					className="flex items-center gap-2 font-medium text-ink hover:text-accent"
				>
					<span aria-hidden>{folder.icon}</span>
					<span>{folder.name}</span>
				</Link>
				<output
					aria-label={`${folder.name} total`}
					className={cn(
						"font-medium text-sm tabular-nums",
						total < 0 && "text-high",
						total > 0 && "text-low",
					)}
				>
					{formatCurrency(total)}
				</output>
			</legend>

			<div className="mt-3 flex flex-wrap gap-2">
				<button type="button" className={BUTTON_CLASS} onClick={onAddLeaf}>
					Add category
				</button>
				<button
					type="button"
					className={BUTTON_CLASS}
					onClick={() => onRename(folder)}
				>
					Rename
				</button>
				<button
					type="button"
					className={BUTTON_CLASS}
					onClick={() => onDelete(folder.id)}
					disabled={deleting}
					aria-label={`Delete ${folder.name}`}
				>
					Delete
				</button>
			</div>

			{leaves.length === 0 ? (
				<p className="mt-3 text-muted text-sm">No categories inside.</p>
			) : (
				<ul className="mt-3 flex flex-col divide-y divide-line">
					{leaves.map((leaf) => (
						<li
							key={leaf.id}
							className="flex items-center justify-between gap-2 py-2"
						>
							<Link
								to="/categories/$categoryId"
								params={{ categoryId: String(leaf.id) }}
								className="flex min-w-0 items-center gap-1.5 text-ink text-sm hover:text-accent"
							>
								<span aria-hidden>{leaf.icon}</span>
								<span className="truncate">{leaf.name}</span>
							</Link>
							<div className="flex shrink-0 gap-2">
								<button
									type="button"
									className={BUTTON_CLASS}
									onClick={() => onRename(leaf)}
									aria-label={`Rename ${leaf.name}`}
								>
									Rename
								</button>
								<button
									type="button"
									className={BUTTON_CLASS}
									onClick={() => onMove(leaf)}
									aria-label={`Move ${leaf.name}`}
								>
									Move
								</button>
								<button
									type="button"
									className={BUTTON_CLASS}
									onClick={() => onDelete(leaf.id)}
									disabled={deleting}
									aria-label={`Delete ${leaf.name}`}
								>
									Delete
								</button>
							</div>
						</li>
					))}
				</ul>
			)}
		</fieldset>
	);
}

interface CategoryEditorDialogProps {
	editor: Editor | null;
	folders: readonly Category[];
	onClose: () => void;
	mutations: ReturnType<typeof useCategoryMutations>;
}

/**
 * The single modal that hosts every add/edit flow, its content switched by the
 * open {@link Editor}. Each submit fires its mutation and closes on success; a
 * rejected write (a depth-3 move, a folder-with-children move, a name clash)
 * surfaces as a toast from the mutation hook and leaves the dialog open.
 */
function CategoryEditorDialog({
	editor,
	folders,
	onClose,
	mutations,
}: CategoryEditorDialogProps) {
	return (
		<Dialog open={editor !== null} onOpenChange={(open) => !open && onClose()}>
			{/* Each form is a single labelled field, so no separate description. */}
			<DialogContent aria-describedby={undefined}>
				{editor?.kind === "createFolder" && (
					<NameForm
						title="New folder"
						submitLabel="Create folder"
						pending={mutations.createFolder.isPending}
						onSubmit={(name) =>
							mutations.createFolder.mutate(name, { onSuccess: onClose })
						}
					/>
				)}
				{editor?.kind === "createLeaf" && (
					<NameForm
						title={`New category in ${editor.parent.name}`}
						submitLabel="Create category"
						pending={mutations.createLeaf.isPending}
						onSubmit={(name) =>
							mutations.createLeaf.mutate(
								{ name, parentId: editor.parent.id },
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
						leaf={editor.leaf}
						folders={folders}
						pending={mutations.move.isPending}
						onSubmit={(parentId) =>
							mutations.move.mutate(
								{ id: editor.leaf.id, parentId },
								{ onSuccess: onClose },
							)
						}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** A one-field name form — create-folder, create-leaf, and rename all share it. */
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

/** Move a leaf under a different folder — the target picked from a `select`. */
function MoveForm({
	leaf,
	folders,
	pending,
	onSubmit,
}: {
	leaf: Category;
	folders: readonly Category[];
	pending: boolean;
	onSubmit: (parentId: CategoryId) => void;
}) {
	// Default to the leaf's current folder so a stray submit is a no-op, not a move.
	const [target, setTarget] = useState<string>(String(leaf.parentId ?? ""));

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (pending || target === "") return;
		onSubmit(Number(target) as CategoryId);
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<DialogHeader>
				<DialogTitle>Move {leaf.name}</DialogTitle>
			</DialogHeader>
			<label className="flex flex-col gap-1 text-muted text-sm">
				Folder
				<select
					className={INPUT_CLASS}
					value={target}
					onChange={(e) => setTarget(e.target.value)}
					aria-label="Target folder"
				>
					{folders.map((folder) => (
						<option key={folder.id} value={String(folder.id)}>
							{categoryPath(folders, folder)}
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
